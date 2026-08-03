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
  const stringFields = cols.filter((c) => c !== '__row_id');
  const blockingConfig = {
    ...config,
    blocking: config.blocking ?? {
      passes: stringFields.map((f) => ({ fields: [f], transforms: ['lowercase'] as string[] })),
    },
  };

  // Fast path for sub-10K records: single SELECT (no CTAS, one FFI call)
  if (records.length < 10000) {
    const tFast = performance.now();
    const scoredSql = buildFastSingleQuery(inputTable, blockingConfig, config, cols);
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
        caseSql += ` WHEN ${dbFn(c.scorerName)}(l."${f}",r."${f}")>=${Number(l.threshold ?? 0.7)} THEN ${i}`;
    }
    const levelExpr = `${caseSql} ELSE -1 END AS ${f}_level`;

    // Extract trained m/u for this field (EM uses "field:level" keys)
    let m = 0.9,
      u = 0.1;
    for (const [key, val] of emParams.mProbabilities.entries()) {
      if (key.startsWith(c.field + ':')) {
        m = val;
        break;
      }
    }
    for (const [key, val] of emParams.uProbabilities.entries()) {
      if (key.startsWith(c.field + ':')) {
        u = val;
        break;
      }
    }
    const matchW = Math.log2(m / u).toFixed(4);
    const nomatchW = Math.log2((1 - m) / (1 - u)).toFixed(4);
    const weightExpr = `CASE WHEN ${f}_level>=0 THEN ${matchW} ELSE ${nomatchW} END AS ${f}_weight`;

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

  const sampleSize = Math.min(2000, records.length);
  const blockResult = standardBlocking(records.slice(0, sampleSize), {
    fields: Object.keys(records[0] ?? {}).filter((k) => k !== '__row_id'),
    transforms: ['lowercase'],
  });
  const candidates = blockResult.pairs.slice(0, 3000);

  if (candidates.length < 10) return defaults;

  // Generate comparison vectors for EM
  const fieldMeta = new Map<
    string,
    { name: string; semanticType: string; cardinality: number; isNumeric: boolean }
  >();
  for (const c of config.comparisons) {
    fieldMeta.set(c.field, {
      name: c.field,
      semanticType: 'text',
      cardinality: 10,
      isNumeric: false,
    });
  }

  const vectors: ComparisonVector[][] = [];
  for (const pair of candidates) {
    const a = records[pair.leftId]!;
    const b = records[pair.rightId]!;
    if (a && b) {
      vectors.push(
        generateComparisonVectors(a, b, config.comparisons, fieldMeta),
      );
    }
  }

  if (vectors.length < 5) return defaults;

  try {
    const emResult = estimateParameters(vectors, { maxIterations: 20, epsilon: 1e-4 });
    return emResult.parameters;
  } catch {
    return defaults;
  }
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
        p.transforms?.[0] === 'lowercase' ? `LOWER(l."${f}")=LOWER(r."${f}")` : `l."${f}"=r."${f}"`,
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
  const prefixCond = strCols
    .map((c) => `LEFT(LOWER(l."${c}"),3)=LEFT(LOWER(r."${c}"),3)`)
    .join(' OR ');

  const parts = passes.map((p) => {
    const conditions = (p.fields ?? [fallbackField])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(l."${f}")=LOWER(r."${f}")` : `l."${f}"=r."${f}"`,
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
): string {
  const fallbackField = (blockingConfig.blocking?.fields?.[0] ?? cols[0] ?? '__row_id');
  const passes = blockingConfig.blocking?.passes ?? [{ fields: [fallbackField], transforms: [] }];
  const activeComps = config.comparisons.filter((c) => cols.includes(c.field));

  const mw = '3.169925',
    nmw = '-3.169925';
  const compParts = activeComps.map((c) => {
    const f = esc(c.field);
    const lvls = c.levels?.length ? c.levels : [{}];
    let caseSql = 'CASE';
    for (let i = lvls.length - 1; i >= 0; i--) {
      const l = lvls[i]! as Record<string, unknown>;
      if (l.isExact || c.scorerName === 'exact') caseSql += ` WHEN l."${f}"=r."${f}" THEN ${i}`;
      else if (l.isNull) caseSql += ` WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i}`;
      else
        caseSql += ` WHEN ${dbFn(c.scorerName)}(l."${f}",r."${f}")>=${Number(l.threshold ?? 0.7)} THEN ${i}`;
    }
    return {
      field: f,
      level: `${caseSql} ELSE -1 END AS ${f}_level`,
      weight: `CASE WHEN ${f}_level>=0 THEN ${mw} ELSE ${nmw} END AS ${f}_weight`,
    };
  });

  const blockParts = passes.map((p) => {
    const conditions = (p.fields ?? [fallbackField])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(l."${f}")=LOWER(r."${f}")` : `l."${f}"=r."${f}"`,
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

  await backend.createTempTable(
    leftRecords.map((r, i) => ({ __row_id: i, ...r })),
    { name: leftTable },
  );
  await backend.createTempTable(
    rightRecords.map((r, i) => ({ __row_id: i + leftRecords.length, ...r })),
    { name: rightTable },
  );

  const stringFields = cols.filter((c) => c !== '__row_id');
  const passes =
    config.blocking?.passes ??
    stringFields.map((f) => ({ fields: [f], transforms: ['lowercase'] as string[] }));

  // Blocking: cross-join between left and right only
  const t0 = performance.now();
  const blockedTable = `__er_link_bl_${Date.now()}`;
  const blockParts = passes.map((p) => {
    const conditions = (p.fields ?? [cols[0] ?? '__row_id'])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(l."${f}")=LOWER(r."${f}")` : `l."${f}"=r."${f}"`,
      )
      .join(' AND ');
    if (stringFields.length >= 2) {
      const prefixCond = stringFields
        .map((c) => `LEFT(LOWER(l."${c}"),3)=LEFT(LOWER(r."${c}"),3)`)
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
      else s += ` WHEN ${dbFn(c.scorerName)}(l."${f}",r."${f}")>=${Number(l.threshold ?? 0.7)} THEN ${i}`;
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
  ensemble: 'jaro_winkler_similarity',
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
  const clamped = Math.max(-20, Math.min(20, weight));
  return 1 / (1 + Math.exp(-clamped * Math.LN2));
}
async function dropAll(be: ISqlBackend, ts: string[]): Promise<void> {
  for (const t of ts)
    try {
      await be.dropTempTable(t);
    } catch {
      // Best-effort cleanup: table may not exist
    }
}
