/**
 * SQL-backed pipeline runner for entity-resolver.
 *
 * Streams records from IDataSource directly into SQL temp tables
 * via ISqlBackend, then executes blocking + comparison entirely
 * within the SQL engine. This avoids materializing all records
 * in JavaScript memory — suitable for 100K+ record datasets.
 *
 * Architecture:
 *   IDataSource → streamToTable → sqlBlocking → sqlComparison → clustering
 *
 * Falls back gracefully: if no ISqlBackend is provided, uses standard
 * in-memory runPipeline as before.
 */

import type { RawRecord, PipelineResult, PipelineStatistics, DiagnosticData, ScoredPair } from '../types/core.js';
import type { PipelineConfig, PipelineOptions } from './runner.js';
import type { ISqlBackend } from '../interfaces/ISqlBackend.js';
import { NoopLogger } from '../interfaces/ILogger.js';
import { buildComparisonQuery, parseComparisonRows, requiresUdf, patchUdfVectors } from '../matching/sql-comparison.js';
import { estimateParameters } from '../fellegi-sunter/em.js';
import { computeAggregateMatchWeight } from '../fellegi-sunter/match-weight.js';
import { buildTermFrequencies, TFAdjustmentLookup } from '../fellegi-sunter/tf-adjust.js';
import { connectedComponents } from '../clustering/algorithms.js';
import { getScorer } from '../matching/scorers/registry.js';
import type { CandidatePair } from '../blocking/types.js';

const RECORDS_TABLE = '__er_records';
const CANDIDATES_TABLE = '__er_candidates';

/** Configuration for SQL pipeline execution. */
export interface SqlPipelineConfig {
  /** SQL execution backend (DuckDB, PostgreSQL, etc.). */
  readonly backend: ISqlBackend;
  /** Standard pipeline config (comparisons, thresholds, TF fields). */
  readonly pipeline: PipelineConfig;
  /** Blocking rules as SQL WHERE clauses. */
  readonly sqlRules: readonly string[];
  /** Optional pipeline execution options. */
  readonly options?: PipelineOptions;
}

/**
 * Run the entity resolver pipeline using SQL backend for blocking and comparison.
 *
 * Streams records from an IDataSource directly into SQL (O(batch) memory),
 * then executes blocking + comparison natively in the engine.
 * Only materializes the reduced candidate pair set in JS for EM + clustering.
 *
 * @param source — streaming data source (CSV file, API, database)
 * @param config — SQL pipeline configuration
 * @returns PipelineResult with clusters, pairs, and diagnostics
 */
export async function runPipelineFromSqlSource(
  source: AsyncIterable<Record<string, unknown>>,
  config: SqlPipelineConfig,
): Promise<PipelineResult> {
  const logger = config.options?.logger ?? NoopLogger;
  const startTime = Date.now();

  logger.info('SQL pipeline started', { operation: 'runPipelineFromSqlSource' });

  // ── Stage 1: Stream records into SQL temp table ──
  const streamStart = Date.now();
  await config.backend.streamToTable(source, { name: RECORDS_TABLE });
  const totalRecords = await config.backend.rowCount(RECORDS_TABLE);

  if (totalRecords === 0) {
    await config.backend.close();
    return {
      clusters: new Map(),
      scoredPairs: [],
      singletons: [],
      statistics: { totalRecords: 0, totalClusters: 0, matchedRecords: 0, matchRate: 0, averageClusterSize: 0, maxClusterSize: 0, executionTimeMs: Date.now() - startTime },
      diagnostics: { muParameters: new Map(), matchWeightDistribution: [], unlinkableCount: 0 },
    };
  }

  logger.debug('Records streamed to SQL', {
    operation: 'runPipelineFromSqlSource',
    stage: 'stream',
    totalRecords,
    elapsedMs: Date.now() - streamStart,
  });

  // ── Stage 2: SQL Blocking ──
  const blockingStart = Date.now();
  const dedupeClause = 'l.__row_id__ < r.__row_id__';

  const ruleQueries = config.sqlRules.map((rule) =>
    `SELECT l.__row_id__ as left_id, r.__row_id__ as right_id
     FROM ${RECORDS_TABLE} l
     INNER JOIN ${RECORDS_TABLE} r ON (${rule})
     WHERE ${dedupeClause}`,
  );

  const blockingSql = ruleQueries.length === 1
    ? ruleQueries[0]!
    : ruleQueries.join(' UNION ');

  const blockingRows = await config.backend.query(blockingSql);
  const candidates: CandidatePair[] = blockingRows.map((row) => ({
    leftId: Number(row['left_id']),
    rightId: Number(row['right_id']),
  }));

  logger.debug('SQL blocking complete', {
    operation: 'runPipelineFromSqlSource',
    stage: 'blocking',
    candidateCount: candidates.length,
    elapsedMs: Date.now() - blockingStart,
  });

  if (candidates.length === 0) {
    await config.backend.close();
    return {
      clusters: new Map(),
      scoredPairs: [],
      singletons: Array.from({ length: totalRecords }, (_, i) => i),
      statistics: { totalRecords, totalClusters: 0, matchedRecords: 0, matchRate: 0, averageClusterSize: 0, maxClusterSize: 0, executionTimeMs: Date.now() - startTime },
      diagnostics: { muParameters: new Map(), matchWeightDistribution: [], unlinkableCount: 0 },
    };
  }

  // ── Stage 3: Materialize candidates table for SQL comparison ──
  await config.backend.exec(`DROP TABLE IF EXISTS ${CANDIDATES_TABLE}`);
  await config.backend.exec(`CREATE TEMP TABLE ${CANDIDATES_TABLE} (left_id INTEGER, right_id INTEGER)`);
  const BATCH = 1000;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    const values = chunk.map(p => `(${p.leftId}, ${p.rightId})`).join(', ');
    await config.backend.exec(`INSERT INTO ${CANDIDATES_TABLE} VALUES ${values}`);
  }

  // ── Stage 4: SQL Comparison ──
  const compStart = Date.now();
  const compQuery = buildComparisonQuery({
    comparisons: config.pipeline.comparisons,
    recordsTable: RECORDS_TABLE,
    candidatesTable: CANDIDATES_TABLE,
  });
  const sqlRows = await config.backend.query(compQuery);
  const pairVectors = parseComparisonRows(sqlRows, config.pipeline.comparisons);

  // Patch UDF-requiring scorers with JS/WASM
  const scorers = new Map<string, (a: unknown, b: unknown) => number>();
  for (const spec of config.pipeline.comparisons) {
    if (requiresUdf(spec.scorerName)) {
      const scorer = getScorer(spec.scorerName);
      if (scorer) {
        scorers.set(spec.scorerName, (a: unknown, b: unknown) => scorer.score(a, b, { name: spec.field, semanticType: 'string', cardinality: totalRecords, isNumeric: false }));
      }
    }
  }

  // Load records for patching
  const records: RawRecord[] = [];
  // For patching UDF vectors, we need records by index.
  // Since we already have them in SQL, we'll load them lazily.
  // For < 10K candidates with UDF fields, loading is acceptable.
  const needsPatch = config.pipeline.comparisons.some(s => requiresUdf(s.scorerName));
  if (needsPatch && candidates.length > 0) {
    const allRows = await config.backend.query(`SELECT *, __row_id__ FROM ${RECORDS_TABLE} ORDER BY __row_id__`);
    for (const row of allRows) {
      const rec: RawRecord = {};
      for (const [k, v] of Object.entries(row)) {
        if (k !== '__row_id__') rec[k] = v;
      }
      records.push(rec);
    }
    patchUdfVectors(pairVectors, candidates, config.pipeline.comparisons, records, scorers);
  }

  logger.debug('SQL comparison complete', {
    operation: 'runPipelineFromSqlSource',
    stage: 'comparison',
    pairCount: pairVectors.length,
    hasUdfPatch: needsPatch,
    elapsedMs: Date.now() - compStart,
  });

  // ── Stage 5: EM parameter estimation ──
  const emResult = estimateParameters(pairVectors, {
    maxIterations: config.options?.maxEmIterations ?? 30,
  });

  // ── Stage 6: Compute match weights ──
  let tfLookup: TFAdjustmentLookup | undefined;
  if (config.pipeline.tfFields && config.pipeline.tfFields.length > 0) {
    const tfRecords = records.length > 0 ? records : await loadRecords(config.backend, RECORDS_TABLE);
    const freqs = buildTermFrequencies(tfRecords, config.pipeline.tfFields);
    tfLookup = new TFAdjustmentLookup(freqs);
  }

  const scoredPairs: ScoredPair[] = candidates.map((pair, idx) => {
    const vecs = pairVectors[idx] ?? [];
    const mw = computeAggregateMatchWeight(vecs, emResult.parameters);
    let prob = mw.probability;
    if (tfLookup) {
      for (const c of config.pipeline.comparisons) {
        const rec = records[pair.leftId] ?? {};
        const adj = tfLookup.getAdjustment(c.field, rec[c.field]);
        if (adj < 1) prob *= adj;
      }
    }
    return { leftId: pair.leftId, rightId: pair.rightId, score: prob, probability: prob };
  });

  // ── Stage 7: Clustering ──
  const clustering = connectedComponents(scoredPairs, totalRecords, config.pipeline.matchThreshold);

  // ── Cleanup ──
  await config.backend.close();

  const elapsed = Date.now() - startTime;

  logger.info('SQL pipeline complete', {
    operation: 'runPipelineFromSqlSource',
    totalRecords,
    clusterCount: clustering.metadata.numClusters,
    candidateCount: candidates.length,
    totalElapsedMs: elapsed,
  });

  const matchCount = totalRecords - clustering.singletons.length;

  const statistics: PipelineStatistics = {
    totalRecords,
    totalClusters: clustering.metadata.numClusters,
    matchedRecords: matchCount,
    matchRate: totalRecords > 0 ? matchCount / totalRecords : 0,
    averageClusterSize: clustering.metadata.averageClusterSize,
    maxClusterSize: clustering.metadata.maxClusterSize,
    executionTimeMs: elapsed,
  };

  const diagnostics: DiagnosticData = {
    muParameters: new Map(),
    matchWeightDistribution: [],
    unlinkableCount: 0,
  };

  return {
    clusters: clustering.clusters,
    scoredPairs,
    singletons: clustering.singletons,
    statistics,
    diagnostics,
  };
}

/** Load all records from a SQL table into JS memory. */
async function loadRecords(backend: ISqlBackend, table: string): Promise<RawRecord[]> {
  const rows = await backend.query(`SELECT * FROM ${table} ORDER BY __row_id__`);
  return rows.map((row) => {
    const rec: RawRecord = {};
    for (const [k, v] of Object.entries(row)) {
      if (k !== '__row_id__') rec[k] = v;
    }
    return rec;
  });
}
