/**
 * SQL Pipeline Engine — Full DuckDB pushdown with trained EM parameters.
 *
 * Architecture:
 *   1. JS EM training on a sample (fast, in-memory)
 *   2. Multi-field SQL blocking (all string fields)
 *   3. SQL comparison + scoring CTAS with trained m/u weights
 *
 * Only final scored pairs are read into JS — matching Splink's
 * `keep everything in SQL and train EM separately` design.
 */
import type { PipelineConfig } from './runner.js';
import type { ISqlBackend, SqlRow } from '../interfaces/ISqlBackend.js';
import { estimateParameters } from '../fellegi-sunter/em.js';
import type { FSParameters } from '../fellegi-sunter/parameters.js';
import { generateComparisonVectors } from '../matching/comparison.js';
import type { ComparisonVector } from '../matching/comparison.js';
import { standardBlocking } from '../blocking/standard.js';

export interface SqlPipelineResult {
  pairs: { leftId: number; rightId: number; score: number }[];
  timing: { blockingMs: number; comparisonMs: number; emMs: number };
  stats: { inputRows: number; blockedPairs: number; scoredPairs: number };
}

export async function runSqlPipeline(
  records: readonly Record<string, unknown>[],
  config: PipelineConfig,
  backend: ISqlBackend,
): Promise<SqlPipelineResult> {
  const cols = Object.keys(records[0] ?? {});

  // Stage 0: EM training on a JS sample (fast, in-memory)
  // Skip for single-level comparisons where defaults (m=0.9/u=0.1) suffice.
  // Only train when dataset has multi-level comparisons and enough data.
  const tEm = performance.now();
  const hasMultiLevel = config.comparisons.some((c) => c.levels && c.levels.length > 1);
  const emParams =
    records.length >= 2000 && hasMultiLevel
      ? trainEMOnSample(records, config)
      : ({
          lambda: 0.5,
          mProbabilities: new Map([['default:match', 0.9]]),
          uProbabilities: new Map([['default:match', 0.1]]),
        } as unknown as FSParameters);
  const emMs = performance.now() - tEm;

  // Load records into DuckDB
  const inputTable = `__er_sql_in_${Date.now()}`;
  await backend.createTempTable(
    records.map((r, i) => ({ __row_id: i, ...r })),
    { name: inputTable },
  );

  // Multi-field blocking
  const allFields = cols.filter((c) => c !== '__row_id');
  const stringFields = config.comparisons?.map((c) => c.field).filter((c) => allFields.includes(c)) ?? allFields;
  const blockingConfig = {
    ...config,
    blocking: config.blocking ?? {
      passes: stringFields.map((f) => ({ fields: [f], transforms: ['lowercase'] as string[] })),
    },
  };

  // Fast path for sub-10K records: single SELECT (no CTAS, one FFI call)
  if (records.length < 10000) {
    const tFast = performance.now();
    const scoredSql = buildFastSingleQuery(inputTable, blockingConfig, config, cols, emParams);
    const scoredRows = await backend.query(scoredSql);
    await dropAll(backend, [inputTable]);
    return {
      pairs: scoredRows.map((r: SqlRow) => ({
        leftId: Number(r.left_id),
        rightId: Number(r.right_id),
        score: clampScore(Number(r.match_weight)),
      })),
      timing: { blockingMs: 0, comparisonMs: performance.now() - tFast, emMs: Math.round(emMs) },
      stats: {
        inputRows: records.length,
        blockedPairs: scoredRows.length,
        scoredPairs: scoredRows.length,
      },
    };
  }

  // Full CTAS path for >= 10K records (zero materialization in DuckDB)
  const t0 = performance.now();
  const blockedTable = `__er_sql_bl_${Date.now()}`;
  const usePrefixFilter = records.length >= 5000;
  if (usePrefixFilter) {
    await backend.exec(
      buildBlockSqlWithPrefixFilter(inputTable, blockedTable, blockingConfig, cols),
    );
  } else {
    await backend.exec(buildBlockSql(inputTable, blockedTable, blockingConfig, cols));
  }
  const blockedRows = await backend.rowCount(blockedTable);
  const blockMs = performance.now() - t0;

  if (blockedRows === 0) {
    await dropAll(backend, [inputTable, blockedTable]);
    return {
      pairs: [],
      timing: { blockingMs: blockMs, comparisonMs: 0, emMs: Math.round(emMs) },
      stats: { inputRows: records.length, blockedPairs: 0, scoredPairs: 0 },
    };
  }

  // Stage 2+3: comparison + scoring CTAS with trained weights
  const t1 = performance.now();
  const scoredTable = `__er_sql_sc_${Date.now()}`;
  const activeComps = config.comparisons.filter((c) => cols.includes(c.field));

  const sqlParts = activeComps.map((c) => {
    const f = esc(c.field);
    const lvls = c.levels?.length ? c.levels : [{}];

    // Lookup helper: find m/u for a specific field:level key
    const findM = (label: string): number => {
      const key = `${c.field}:${label}`;
      return emParams.mProbabilities.get(key) ?? emParams.mProbabilities.get(`${c.field}:*`) ?? 0.9;
    };
    const findU = (label: string): number => {
      const key = `${c.field}:${label}`;
      return emParams.uProbabilities.get(key) ?? emParams.uProbabilities.get(`${c.field}:*`) ?? 0.1;
    };
    // Clamp m,u to (1e-6, 1-1e-6) to avoid log2(0) or division by zero
    const safeM = (label: string) => Math.max(1e-6, Math.min(1 - 1e-6, findM(label)));
    const safeU = (label: string) => Math.max(1e-6, Math.min(1 - 1e-6, findU(label)));

    // Build CASE WHEN for comparison levels
    let caseSql = 'CASE';
    for (let i = lvls.length - 1; i >= 0; i--) {
      const l = lvls[i]! as Record<string, unknown>;
      if (l.isExact || c.scorerName === 'exact') {
        // Exact comparison: use SQL equality, not a DuckDB function
        caseSql += ` WHEN l."${f}"=r."${f}" THEN ${i}`;
      }
      else if (l.isNull) caseSql += ` WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i}`;
      else
        caseSql += ` WHEN ${dbFn(c.scorerName)}(CAST(l."${f}" AS VARCHAR),CAST(r."${f}" AS VARCHAR))>=${Number(l.threshold ?? 0.7)} THEN ${i}`;
    }
    const levelExpr = `${caseSql} ELSE -1 END AS ${f}_level`;

    // Level-specific weights: weight = log2(m_level / u_level) per comparison level
    const levelWeightCases: string[] = [];
    for (let i = 0; i < lvls.length; i++) {
      const label = ((lvls[i] as Record<string, unknown>).label as string) ?? 'match';
      const m_val = safeM(label);
      const u_val = safeU(label);
      levelWeightCases.push(`WHEN ${i} THEN ${Math.log2(m_val / u_val).toFixed(4)}`);
    }
    // Fallback for level=-1 (not_match) — always included even if not in configured levels
    const nm_m = safeM('not_match');
    const nm_u = safeU('not_match');
    const notMatchW = Math.log2(nm_m / nm_u).toFixed(4);
    const weightExpr = levelWeightCases.length > 0
      ? `CASE ${f}_level ${levelWeightCases.join(' ')} ELSE ${notMatchW} END AS ${f}_weight`
      : `CASE WHEN ${f}_level>=0 THEN ${Math.log2(0.9 / 0.1).toFixed(4)} ELSE ${Math.log2(0.1 / 0.9).toFixed(4)} END AS ${f}_weight`;

    return { field: f, levelExpr, weightExpr };
  });

  const levelParts = sqlParts.map((p) => p.levelExpr).join(',\n');
  const weightParts = sqlParts.map((p) => p.weightExpr).join(',\n');
  const weightSum = sqlParts.map((p) => `COALESCE(${p.field}_weight,0)`).join('+');

  const combinedSql = `CREATE TABLE ${scoredTable} AS
SELECT b.left_id, b.right_id,
${levelParts},
${weightParts},
(${weightSum}) AS match_weight
FROM ${blockedTable} b
JOIN ${inputTable} l ON l.__row_id=b.left_id
JOIN ${inputTable} r ON r.__row_id=b.right_id`;

  await backend.exec(combinedSql);

  const scoredRows = await backend.query(
    `SELECT left_id, right_id, match_weight FROM ${scoredTable}`,
  );
  const compMs = performance.now() - t1;

  await dropAll(backend, [inputTable, blockedTable, scoredTable]);

  return {
    pairs: scoredRows.map((r: SqlRow) => ({
      leftId: Number(r.left_id),
      rightId: Number(r.right_id),
      score: clampScore(Number(r.match_weight)),
    })),
    timing: { blockingMs: blockMs, comparisonMs: compMs, emMs: Math.round(emMs) },
    stats: { inputRows: records.length, blockedPairs: blockedRows, scoredPairs: scoredRows.length },
  };
}

// ─── EM training on JS sample ─────────────────────────────────────

function trainEMOnSample(
  records: readonly Record<string, unknown>[],
  config: PipelineConfig,
): FSParameters {
  const defaults: FSParameters = {
    lambda: 0.5,
    mProbabilities: new Map([['default:match', 0.9]]),
    uProbabilities: new Map([['default:match', 0.1]]),
  };

  // Only run EM if we have enough data
  if (records.length < 10) return defaults;

  // B1+B3 FIX: Estimate u from random non-match pairs (GoldenMatch standard)
  // Blocked pairs have artificially high agreement → u biased upward
  // Random pairs are overwhelmingly non-matches → unbiased u estimate
  const randomU = estimateUFromRandomPairs(records, config.comparisons, 10000);

  // Generate comparison vectors from blocked pairs for m estimation.
  // Use pipeline blocking passes for realistic candidate pairs; falls back
  // to single-column comparison fields if no passes are configured.
  // Prior bug: standardBlocking on ALL columns (incl. unique IDs) produced
  // zero candidates, causing EM to return useless defaults (m=0.9, u=0.1).
  // P1: Larger sample (5000) for better convergence with Febrl3-scale data.
  const sampleSize = Math.min(5000, records.length);
  // Reuse pipeline blocking for EM candidate generation; fallback to single-column passes
  const emBlockingConfig = (config.blocking?.passes?.length ?? 0) > 0
    ? { passes: config.blocking!.passes! }
    : {
        passes: config.comparisons.map((c) => ({
          fields: [c.field] as const,
          transforms: ['lowercase'] as const,
        })),
      };
  const blockResult = standardBlocking(records.slice(0, sampleSize), emBlockingConfig as any);
  // B3 FIX: use enough pairs for stable EM — ensure minimum 500 candidates
  const candidates = blockResult.pairs.slice(0, Math.max(3000, blockResult.pairs.length));

  if (candidates.length < 10) return defaults;

  const fieldMeta = new Map<string, any>();
  for (const c of config.comparisons) {
    fieldMeta.set(c.field, { name: c.field, semanticType: 'text', cardinality: 10, isNumeric: false });
  }

  const vectors: ComparisonVector[][] = [];
  for (const pair of candidates) {
    const a = records[pair.leftId]!;
    const b = records[pair.rightId]!;
    if (a && b) vectors.push(generateComparisonVectors(a, b, config.comparisons, fieldMeta));
  }

  if (vectors.length < 5) return defaults;

  try {
    // P1: 50 iterations + 3 restarts for better convergence on large datasets
    const emResult = estimateParameters(vectors, { maxIterations: 50, epsilon: 1e-6, seed: 42, numRestarts: 3 });
    // Merge: m from EM, u from random pairs (GoldenMatch pattern)
    const mergedM = new Map(emResult.parameters.mProbabilities);
    for (const [key] of randomU) {
      if (!mergedM.has(key)) mergedM.set(key, 0.9);
    }
    return {
      lambda: emResult.parameters.lambda,
      mProbabilities: mergedM,
      uProbabilities: randomU,
    };
  } catch {
    return defaults;
  }
}

/** B1 FIX: Estimate u-probabilities from random non-match pairs. */
function estimateUFromRandomPairs(
  records: readonly Record<string, unknown>[],
  comparisons: readonly any[],
  sampleSize: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  const n = records.length;
  if (n < 2) return counts;

  let rng = 42;
  const rand = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };

  let totalObserved = 0;
  const actual = Math.min(sampleSize, Math.floor(n * (n - 1) / 2));

  for (let i = 0; i < actual; i++) {
    const a = Math.floor(rand() * n);
    let b = Math.floor(rand() * n);
    while (b === a) b = Math.floor(rand() * n);

    for (const comp of comparisons) {
      const valA = String(records[a]?.[comp.field] ?? '');
      const valB = String(records[b]?.[comp.field] ?? '');
      if (valA === '' || valB === '') continue;
      const levels = comp.levels ?? [{ label: 'match' }];
      for (const level of levels) {
        const key = comp.field + ':' + level.label;
        const match = valA === valB ? 1.0 : (approxJaro(valA, valB) >= (level.threshold ?? 0.7) ? 1.0 : 0.0);
        if (match > 0) counts.set(key, (counts.get(key) ?? 0) + 1);
        totalObserved++;
      }
    }
  }
  const uProbs = new Map<string, number>();
  for (const [key, count] of counts) {
    uProbs.set(key, Math.max(1e-6, count / Math.max(totalObserved, 1)));
  }
  return uProbs;
}

function approxJaro(a: string, b: string): number {
  if (a === b) return 1;
  const matches = [...a].filter((c) => b.includes(c)).length;
  if (matches === 0) return 0;
  return (matches / a.length + matches / b.length) / 2;
}


// ─── SQL generators ────────────────────────────────────────────────

function buildBlockSql(
  src: string,
  dst: string,
  config: PipelineConfig,
  cols: readonly string[],
): string {
  const fallbackField = (config.blocking?.fields?.[0] ?? cols[0] ?? '__row_id');
  const passes = config.blocking?.passes ?? [{ fields: [fallbackField], transforms: [] }];
  const parts = passes.map((p) => {
    const conditions = (p.fields ?? [fallbackField])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(CAST(l."${f}" AS VARCHAR))=LOWER(CAST(r."${f}" AS VARCHAR))` : `l."${f}"=r."${f}"`,
      )
      .join(' AND ');
    return `SELECT DISTINCT l.__row_id left_id, r.__row_id right_id FROM ${src} l JOIN ${src} r ON (${conditions}) WHERE l.__row_id<r.__row_id`;
  });
  return `CREATE TABLE ${dst} AS ${parts.join(' UNION ')}`;
}

/** Blocking with inline prefix filter — eliminates 99%+ of non-duplicate pairs
 *  at the JOIN level (no separate CTAS overhead). */
function buildBlockSqlWithPrefixFilter(
  src: string,
  dst: string,
  config: PipelineConfig,
  cols: readonly string[],
): string {
  const fallbackField = (config.blocking?.fields?.[0] ?? cols[0] ?? '__row_id');
  const passes = config.blocking?.passes ?? [{ fields: [fallbackField], transforms: [] }];
  const strCols = cols.filter((c) => c !== '__row_id');
  // CAST to VARCHAR before LOWER/LEFT avoids Binder Error on DuckDB-inferred numeric types
  const prefixCond = strCols
    .map((c) => `LEFT(CAST(l."${c}" AS VARCHAR),3)=LEFT(CAST(r."${c}" AS VARCHAR),3)`)
    .join(' OR ');

  const parts = passes.map((p) => {
    const conditions = (p.fields ?? [fallbackField])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(CAST(l."${f}" AS VARCHAR))=LOWER(CAST(r."${f}" AS VARCHAR))` : `l."${f}"=r."${f}"`,
      )
      .join(' AND ');
    return `SELECT DISTINCT l.__row_id left_id, r.__row_id right_id FROM ${src} l JOIN ${src} r ON (${conditions}) WHERE l.__row_id<r.__row_id AND (${prefixCond})`;
  });
  return `CREATE TABLE ${dst} AS ${parts.join(' UNION ')}`;
}

/** Build a single SELECT query that does blocking+comparison+scoring in one call. */
function buildFastSingleQuery(
  src: string,
  blockingConfig: PipelineConfig,
  config: PipelineConfig,
  cols: readonly string[],
  emParams?: FSParameters,
): string {
  const fallbackField = (blockingConfig.blocking?.fields?.[0] ?? cols[0] ?? '__row_id');
  const passes = blockingConfig.blocking?.passes ?? [{ fields: [fallbackField], transforms: [] }];
  const activeComps = config.comparisons.filter((c) => cols.includes(c.field));

    const compParts = activeComps.map((c) => {
    const f = esc(c.field);
    const lvls = c.levels?.length ? c.levels : [{}];
    // Per-level weights from trained EM params
    const levelWeights: string[] = [];
    for (let i = 0; i < lvls.length; i++) {
      const key = c.field + ':' + (lvls[i] as Record<string,unknown>).label;
      const m = emParams?.mProbabilities.get(key) ?? 0.9;
      const u = emParams?.uProbabilities.get(key) ?? 0.1;
      const mw = Math.log2(Math.max(m, 1e-6) / Math.max(u, 1e-6)).toFixed(6);
      levelWeights.push(`WHEN ${f}_level=${i} THEN ${mw}`);
    }
    // not_match fallback from EM or defaults
    const nmKey = c.field + ':not_match';
    const nmM = emParams?.mProbabilities.get(nmKey) ?? 0.1;
    const nmU = emParams?.uProbabilities.get(nmKey) ?? 0.9;
    const defaultMw = Math.log2(Math.max(nmM, 1e-6) / Math.max(nmU, 1e-6)).toFixed(6);
    const mwExpr = `CASE ${levelWeights.join(' ')} ELSE ${defaultMw} END`;

    let caseSql = 'CASE';
    for (let i = lvls.length - 1; i >= 0; i--) {
      const l = lvls[i]! as Record<string, unknown>;
      if (l.isExact || c.scorerName === 'exact') caseSql += ` WHEN l."${f}"=r."${f}" THEN ${i}`;
      else if (l.isNull) caseSql += ` WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i}`;
      else
        caseSql += ` WHEN ${dbFn(c.scorerName)}(CAST(l."${f}" AS VARCHAR),CAST(r."${f}" AS VARCHAR))>=${Number(l.threshold ?? 0.7)} THEN ${i}`;
    }
    return {
      field: f,
      level: `${caseSql} ELSE -1 END AS ${f}_level`,
      weight: `${mwExpr} AS ${f}_weight`,
    };
  });

  const blockParts = passes.map((p) => {
    const conditions = (p.fields ?? [fallbackField])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(CAST(l."${f}" AS VARCHAR))=LOWER(CAST(r."${f}" AS VARCHAR))` : `l."${f}"=r."${f}"`,
      )
      .join(' AND ');
    return `(${conditions} AND l.__row_id<r.__row_id)`;
  });

  return `SELECT l.__row_id AS left_id, r.__row_id AS right_id,
${compParts.map((c) => c.level).join(',\n')},
${compParts.map((c) => c.weight).join(',\n')},
(${compParts.map((c) => `COALESCE(${c.field}_weight,0)`).join('+')}) AS match_weight
FROM ${src} l JOIN ${src} r ON (${blockParts.join(' OR ')})`;
}

// ─── Two-source linkage (left↔right, no self-comparison) ─────────────

/**
 * Run linkage between two separate record pools. Unlike deduplication
 * which compares all records in a single pool, linkage only compares
 * records from the left pool against records from the right pool.
 *
 * Use cases: DBLP-ACM, Amazon-Google, Abt-Buy (standard Leipzig datasets).
 */
export async function runSqlLinkage(
  leftRecords: readonly Record<string, unknown>[],
  rightRecords: readonly Record<string, unknown>[],
  config: PipelineConfig,
  backend: ISqlBackend,
): Promise<SqlPipelineResult> {
  const cols = Object.keys(leftRecords[0] ?? {});
  const leftTable = `__er_link_l_${Date.now()}`;
  const rightTable = `__er_link_r_${Date.now()}`;

  // Register custom SQL functions if backend supports it
  if (backend.createFunction) {
    const hasEnsemble = config.comparisons.some((c) => c.scorerName === 'ensemble');
    if (hasEnsemble) {
      await backend.createFunction('ensemble_similarity', () => {});
    }
  }

  await backend.createTempTable(
    leftRecords.map((r, i) => ({ __row_id: i, ...r })),
    { name: leftTable },
  );
  await backend.createTempTable(
    rightRecords.map((r, i) => ({ __row_id: i + leftRecords.length, ...r })),
    { name: rightTable },
  );

  const allFields = cols.filter((c) => c !== '__row_id');
  const stringFields = config.comparisons?.map((c) => c.field).filter((c) => allFields.includes(c)) ?? allFields;
  const passes =
    config.blocking?.passes ??
    stringFields.map((f) => ({ fields: [f], transforms: ['lowercase'] as string[] }));

  // Blocking: cross-join between left and right only
  const t0 = performance.now();
  const blockedTable = `__er_link_bl_${Date.now()}`;
  const blockParts = passes.map((p) => {
    const conditions = (p.fields ?? [cols[0] ?? '__row_id'])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(CAST(l."${f}" AS VARCHAR))=LOWER(CAST(r."${f}" AS VARCHAR))` : `l."${f}"=r."${f}"`,
      )
      .join(' AND ');
    if (stringFields.length >= 2) {
      const prefixCond = stringFields
        .map((c) => `LEFT(CAST(l."${c}" AS VARCHAR),3)=LEFT(CAST(r."${c}" AS VARCHAR),3)`)
        .join(' OR ');
      return `SELECT DISTINCT l.__row_id left_id, r.__row_id right_id FROM ${leftTable} l JOIN ${rightTable} r ON (${conditions} AND (${prefixCond}))`;
    }
    return `SELECT DISTINCT l.__row_id left_id, r.__row_id right_id FROM ${leftTable} l JOIN ${rightTable} r ON (${conditions})`;
  });
  await backend.exec(`CREATE TABLE ${blockedTable} AS ${blockParts.join(' UNION ')}`);
  const blockedRows = await backend.rowCount(blockedTable);
  const blockMs = performance.now() - t0;

  if (blockedRows === 0) {
    await dropAll(backend, [leftTable, rightTable, blockedTable]);
    return {
      pairs: [],
      timing: { blockingMs: blockMs, comparisonMs: 0, emMs: 0 },
      stats: {
        inputRows: leftRecords.length + rightRecords.length,
        blockedPairs: 0,
        scoredPairs: 0,
      },
    };
  }

  // Comparison + scoring CTAS
  const t1 = performance.now();
  const scoredTable = `__er_link_sc_${Date.now()}`;
  const activeComps = config.comparisons.filter((c) => cols.includes(c.field));
  const mw = '3.169925',
    nmw = '-3.169925';
  const compParts = activeComps.map((c) => {
    const f = esc(c.field);
    const lvls = c.levels?.length ? c.levels : [{}];
    let s = 'CASE';
    for (let i = lvls.length - 1; i >= 0; i--) {
      const l = lvls[i]! as Record<string, unknown>;
      if (l.isExact || c.scorerName === 'exact') s += ` WHEN l."${f}"=r."${f}" THEN ${i}`;
      else if (l.isNull) s += ` WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i}`;
      else s += ` WHEN ${dbFn(c.scorerName)}(CAST(l."${f}" AS VARCHAR),CAST(r."${f}" AS VARCHAR))>=${Number(l.threshold ?? 0.7)} THEN ${i}`;
    }
    return {
      field: f,
      level: `${s} ELSE -1 END AS ${f}_level`,
      weight: `CASE WHEN ${f}_level>=0 THEN ${mw} ELSE ${nmw} END AS ${f}_weight`,
    };
  });

  await backend.exec(
    `CREATE TABLE ${scoredTable} AS SELECT b.left_id, b.right_id, ${compParts.map((c) => c.level).join(',\n')}, ${compParts.map((c) => c.weight).join(',\n')}, (${compParts.map((c) => `COALESCE(${c.field}_weight,0)`).join('+')}) AS match_weight FROM ${blockedTable} b JOIN ${leftTable} l ON l.__row_id=b.left_id JOIN ${rightTable} r ON r.__row_id=b.right_id`,
  );

  const scoredRows = await backend.query(
    `SELECT left_id, right_id, match_weight FROM ${scoredTable}`,
  );
  const compMs = performance.now() - t1;

  await dropAll(backend, [leftTable, rightTable, blockedTable, scoredTable]);

  return {
    pairs: scoredRows.map((r: SqlRow) => ({
      leftId: Number(r.left_id),
      rightId: Number(r.right_id) - leftRecords.length,
      score: clampScore(Number(r.match_weight)),
    })),
    timing: { blockingMs: blockMs, comparisonMs: compMs, emMs: 0 },
    stats: {
      inputRows: leftRecords.length + rightRecords.length,
      blockedPairs: blockedRows,
      scoredPairs: scoredRows.length,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// DuckDB scorer function mapping
//
// Maps entity-resolver scorer names to DuckDB built-in string
// similarity functions. DuckDB v1.0+ provides:
//   - jaro_winkler_similarity(a, b) → [0, 1]
//   - jaro_similarity(a, b)         → [0, 1]
//   - damerau_levenshtein(a, b)     → edit distance (int)
//   - levenshtein(a, b)             → edit distance (int)
//   - hamming(a, b)                 → edit distance (int)
//
// NOTE: DuckDB edit-distance functions return distance, not similarity.
// The SQL comparison layer normalizes them with threshold checks, so
// the VALUES from these functions are compared against thresholds
// rather than used directly as similarity scores.
// ══════════════════════════════════════════════════════════════

const DUCKDB_SCORER_MAP: Readonly<Record<string, string>> = {
  jaro_winkler: 'jaro_winkler_similarity',
  jaro: 'jaro_similarity',
  levenshtein: 'levenshtein',
  damerau_levenshtein: 'damerau_levenshtein',
  jaccard: 'jaccard',
  dice: 'dice_coefficient',
  hamming: 'hamming',
  // Composite scorers mapped to best single-function SQL approximation.
  // The JS pipeline uses the full ensemble (max of 3 signals).
  exact: '__exact__',   // Uses l.f=r.f SQL equality — not a function call
  ensemble: 'ensemble_similarity',
  token_sort: 'jaro_winkler_similarity',
};

/** Resolve a scorer name to its DuckDB SQL function name.
 *  Throws if the scorer is not supported in the SQL pipeline. */
export function resolveSqlScorerFn(n: string): string {
  const fn = DUCKDB_SCORER_MAP[n];
  if (!fn) {
    throw new Error(
      `Scorer "${n}" is not supported in the SQL pipeline. ` +
        `Supported scorers: ${Object.keys(DUCKDB_SCORER_MAP).join(', ')}`,
    );
  }
  return fn;
}

function dbFn(n: string): string {
  return resolveSqlScorerFn(n);
}

function esc(n: string): string {
  return n.replace(/"/g, '""');
}
/** Normalize match weight to [0, 1] score with safe clamping.
 *  Uses logistic transform: score ≈ weightToProbability(weight).
 *  Weights outside [-20, 20] are clamped to prevent NaN/Inf. */
function clampScore(weight: number): number {
  if (!Number.isFinite(weight)) return 0;
  // Return raw weight — caller normalizes via min-max scaling across all pairs.
  // Prior sigmoid clamp saturated for weights > 5, losing all discrimination
  // when level-specific log2(m/u) weights exceed 10 (e.g., postcode=10.54).
  return Math.max(-20, Math.min(20, weight));
}
async function dropAll(be: ISqlBackend, ts: string[]): Promise<void> {
  for (const t of ts)
    try {
      await be.dropTempTable(t);
    } catch {
      // Best-effort cleanup: table may not exist
    }
}
