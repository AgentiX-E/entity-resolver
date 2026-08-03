/**
 * Entity-Resolver accuracy benchmark suite.
 *
 * Runs the entity-resolver pipeline on 5 standard ER datasets with
 * N repeated runs, computing F1/Precision/Recall with mean±std.
 * All results are collected into BenchmarkReport format.
 */
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import type {
  DatasetResult,
  DatasetConfig,
  ClassificationMetrics,
  TimingStats,
} from '../lib/types.js';
import { loadGroundTruth, computeMetrics, aggregateMetrics } from '../lib/metrics.js';
import { STANDARD_DATASETS, FEBRL_CONFIGS, generateFebrlRecords } from '../configs/standard.js';

/** Number of repeated runs per dataset for statistical significance. */
const RUNS = 3;
/** Default score threshold for binary classification. */
const DEFAULT_THRESHOLD = 0.3;

/**
 * Run accuracy benchmarks for all standard datasets.
 * Requires entity-resolver-core and entity-resolver-node to be built.
 */
export async function runEntityResolverAccuracyBenchmarks(
  entityResolverVersion: string,
): Promise<DatasetResult[]> {
  const results: DatasetResult[] = [];

  // Dynamic imports — resolve from built dist
  const coreUrl = new URL(
    '../../packages/entity-resolver-core/dist/index.js',
    import.meta.url,
  );
  const nodeBackendUrl = new URL(
    '../../packages/entity-resolver-node/dist/duckdb-backend.js',
    import.meta.url,
  );

  const core = await import(coreUrl.href) as any;
  const nodeMod = await import(nodeBackendUrl.href) as any;
  const { runPipeline, runSqlLinkage, autoConfigure } = core;
  const { NodeDuckDBBackend } = nodeMod;

  // --- Real linkage datasets ---
  for (const ds of STANDARD_DATASETS) {
    console.log(`\n=== ${ds.name} (${ds.mode}) ===`);
    const metricsRuns: ClassificationMetrics[] = [];
    const timingRuns: number[] = [];

    const leftRecords = loadCsvViaPython(ds.leftPath, ds.encoding);
    const rightRecords = ds.rightPath
      ? loadCsvViaPython(ds.rightPath, ds.encoding, ds.renameColumns)
      : [];
    const groundTruth = loadGroundTruth(ds.mappingPath);

    // Ensure records have an 'id' field for F1 mapping.
    // If the CSV already has an 'id' column (e.g., DBLP-ACM), preserve it.
    // Otherwise assign positional indices.
    for (let i = 0; i < leftRecords.length; i++) {
      if ((leftRecords[i] as any).id === undefined) {
        (leftRecords[i] as any).id = String(i);
      }
    }
    for (let i = 0; i < rightRecords.length; i++) {
      if ((rightRecords[i] as any).id === undefined) {
        (rightRecords[i] as any).id = String(i + leftRecords.length);
      }
    }

    const leftIds = leftRecords.map((r: any) => String(r.id ?? ''));
    const rightIds = rightRecords.map((r: any) => String(r.id ?? ''));

    const config = getDatasetPipelineConfig(ds.name);

    for (let run = 0; run < RUNS; run++) {
      console.log(`  Run ${run + 1}/${RUNS}...`);
      const dbPath = `/tmp/er_bench_${ds.name.replace(/[^a-zA-Z0-9]/g, '_')}_${run}.db`;
      const backend = new NodeDuckDBBackend(dbPath);
      const t0 = performance.now();

      let result: any;
      if (ds.mode === 'linkage') {
        result = await runSqlLinkage(leftRecords, rightRecords, config, backend);
      } else {
        result = await runPipeline([...leftRecords, ...rightRecords], config, { sqlBackend: backend });
      }

      const elapsed = performance.now() - t0;
      timingRuns.push(elapsed);

      const pairs: Array<{ leftId: number; rightId: number; score: number; probability?: number }> =
        result.pairs ?? result.scoredPairs ?? [];

      // For JS pipeline linkage: filter cross-source pairs only
      let filteredPairs = pairs;
      if (ds.mode === 'linkage' && !result.pairs && result.scoredPairs) {
        filteredPairs = pairs.filter(
          (p) => p.leftId < leftRecords.length && p.rightId >= leftRecords.length,
        ).map((p) => ({
          leftId: p.leftId,
          rightId: p.rightId - leftRecords.length,
          score: p.score,
          probability: p.probability,
        }));
      }

      const metrics = computeMetrics(filteredPairs, groundTruth, leftIds, rightIds, DEFAULT_THRESHOLD);
      metricsRuns.push(metrics);
      await backend.close();

      console.log(
        `    F1=${metrics.f1.toFixed(4)} P=${metrics.precision.toFixed(4)} ` +
        `R=${metrics.recall.toFixed(4)} pairs=${filteredPairs.length} ` +
        `time=${(elapsed / 1000).toFixed(1)}s`,
      );
    }

    const aggregated = aggregateMetrics(metricsRuns);
    const meanMs = timingRuns.reduce((a, b) => a + b, 0) / timingRuns.length;
    const timingStdDev = timingRuns.length > 1
      ? Math.sqrt(timingRuns.reduce((s, t) => s + (t - meanMs) ** 2, 0) / (timingRuns.length - 1))
      : 0;

    const timingStats: TimingStats = {
      meanMs: Math.round(meanMs),
      stdDevMs: Math.round(timingStdDev),
      minMs: Math.round(Math.min(...timingRuns)),
      maxMs: Math.round(Math.max(...timingRuns)),
      runs: RUNS,
      perRunMs: timingRuns.map((t) => Math.round(t)),
    };

    results.push({
      dataset: ds.name,
      mode: ds.mode,
      tool: 'entity-resolver',
      recordCount: ds.recordCount,
      trueMatchCount: ds.trueMatchCount,
      metrics: aggregated,
      timing: timingStats,
      candidatePairs: aggregated.predictedPairs,
      configFingerprint: `er-${ds.name}-v1`,
      toolVersion: entityResolverVersion,
    });
  }

  // --- FEBRL synthetic datasets ---
  for (const fb of FEBRL_CONFIGS) {
    console.log(`\n=== ${fb.name} (dedupe, synthetic) ===`);
    const { records: febRecords, groundTruth: febTruth } = generateFebrlRecords(fb.scale, fb.seed);
    const metricsRuns: ClassificationMetrics[] = [];
    const timingRuns: number[] = [];

    // Use the stable _er_id (assigned pre-shuffle) for ground-truth matching,
    // not the post-shuffle positional index.
    const ids = febRecords.map((r: any) => String(r._er_id ?? ''));

    for (let run = 0; run < RUNS; run++) {
      console.log(`  Run ${run + 1}/${RUNS}...`);
      const t0 = performance.now();

      // Use autoConfigure for smart field detection and blocking
      const { config: autoCfg } = autoConfigure(febRecords);

      const result = await runPipeline(febRecords, {
        ...autoCfg,
        matchThreshold: DEFAULT_THRESHOLD,
      });

      const elapsed = performance.now() - t0;
      timingRuns.push(elapsed);

      const pairs = result.scoredPairs ?? result.pairs ?? [];
      const metrics = computeMetrics(pairs, febTruth, ids, ids, DEFAULT_THRESHOLD);
      metricsRuns.push(metrics);

      console.log(
        `    F1=${metrics.f1.toFixed(4)} P=${metrics.precision.toFixed(4)} ` +
        `R=${metrics.recall.toFixed(4)} pairs=${pairs.length} ` +
        `time=${(elapsed / 1000).toFixed(1)}s`,
      );
    }

    const aggregated = aggregateMetrics(metricsRuns);
    const meanMs = timingRuns.reduce((a, b) => a + b, 0) / timingRuns.length;
    const timingStdDev = timingRuns.length > 1
      ? Math.sqrt(timingRuns.reduce((s, t) => s + (t - meanMs) ** 2, 0) / (timingRuns.length - 1))
      : 0;

    results.push({
      dataset: fb.name,
      mode: 'dedupe',
      tool: 'entity-resolver',
      recordCount: febRecords.length,
      trueMatchCount: febTruth.size,
      metrics: aggregated,
      timing: {
        meanMs: Math.round(meanMs),
        stdDevMs: Math.round(timingStdDev),
        minMs: Math.round(Math.min(...timingRuns)),
        maxMs: Math.round(Math.max(...timingRuns)),
        runs: RUNS,
        perRunMs: timingRuns.map((t) => Math.round(t)),
      },
      candidatePairs: aggregated.predictedPairs,
      configFingerprint: `er-${fb.name}-synthetic-seed${fb.seed}`,
      toolVersion: entityResolverVersion,
    });
  }

  return results;
}

/** Load CSV via Python pandas for robust encoding handling. */
function loadCsvViaPython(
  path: string,
  encoding: string,
  renames?: Record<string, string>,
): Array<Record<string, string>> {
  let code = `import pandas as pd,json; d=pd.read_csv('${path}',encoding='${encoding}',dtype=str).fillna('')`;
  if (renames) {
    for (const [k, v] of Object.entries(renames)) {
      code += `; d=d.rename(columns={'${k}':'${v}'})`;
    }
  }
  code += `; recs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]; print(json.dumps(recs))`;
  const output = execSync(`python3 -c "${code}"`, {
    encoding: 'utf-8',
    maxBuffer: 100 * 1024 * 1024,
  }).trim();
  return JSON.parse(output) as Array<Record<string, string>>;
}

/** Get recommended pipeline config for a known dataset. */
function getDatasetPipelineConfig(name: string): any {
  switch (name) {
    case 'DBLP-ACM':
      return {
        comparisons: [
          {
            field: 'title',
            scorerName: 'ensemble',
            levels: [
              { name: 'strong_match', threshold: 0.95 },
              { name: 'moderate_match', threshold: 0.8 },
              { name: 'weak_match', threshold: 0.6 },
            ],
          },
          { field: 'year', scorerName: 'exact', levels: [{ name: 'match', isExact: true as any }] },
        ],
        blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }] },
      };
    case 'Abt-Buy':
      return {
        comparisons: [
          {
            field: 'name',
            scorerName: 'ensemble',
            levels: [
              { name: 'strong_match', threshold: 0.95 },
              { name: 'moderate_match', threshold: 0.7 },
              { name: 'weak_match', threshold: 0.4 },
            ],
          },
          { field: 'price', scorerName: 'exact', levels: [{ name: 'match', isExact: true as any }] },
        ],
        blocking: {
          passes: [
            { fields: ['name'], transforms: ['lowercase'] },
            { fields: ['name'], transforms: ['soundex'] },
          ],
        },
        matchThreshold: 0.5,
      };
    case 'Amazon-Google':
      return {
        comparisons: [
          {
            field: 'title',
            scorerName: 'ensemble',
            levels: [
              { name: 'strong_match', threshold: 0.95 },
              { name: 'moderate_match', threshold: 0.8 },
              { name: 'weak_match', threshold: 0.6 },
            ],
          },
          { field: 'manufacturer', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
        ],
        blocking: {
          passes: [
            { fields: ['title'], transforms: ['lowercase'] },
            { fields: ['manufacturer'], transforms: [] },
          ],
        },
      };
    default:
      return {
        comparisons: [{ field: 'name', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] }],
        blocking: { passes: [{ fields: ['name'], transforms: ['lowercase'] }] },
      };
  }
}
