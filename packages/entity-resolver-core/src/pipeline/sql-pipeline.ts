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
  pairs: Array<{ leftId: number; rightId: number; score: number }>;
  timing: { blockingMs: number; comparisonMs: number; emMs: number };
  stats: { inputRows: number; blockedPairs: number; scoredPairs: number };
}

export async function runSqlPipeline(
  records: ReadonlyArray<Record<string, unknown>>,
  config: PipelineConfig,
  backend: ISqlBackend,
): Promise<SqlPipelineResult> {
  const cols = Object.keys(records[0] ?? {});

  // Stage 0: EM training on a JS sample (fast, in-memory)
  const tEm = performance.now();
  const emParams = trainEMOnSample(records, config);
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

  // Stage 1: SQL blocking
  const t0 = performance.now();
  const blockedTable = `__er_sql_bl_${Date.now()}`;
  await backend.exec(buildBlockSql(inputTable, blockedTable, blockingConfig, cols));
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
      if (l.isExact) caseSql += ` WHEN l."${f}"=r."${f}" THEN ${i}`;
      else if (l.isNull) caseSql += ` WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i}`;
      else
        caseSql += ` WHEN ${dbFn(c.scorerName)}(l."${f}",r."${f}")>=${l.threshold ?? 0.7} THEN ${i}`;
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
    const matchW = Math.log2(Number(m) / Number(u)).toFixed(4);
    const nomatchW = Math.log2((1 - Number(m)) / (1 - Number(u))).toFixed(4);
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
      score: (Number(r.match_weight) + 10) / 20,
    })),
    timing: { blockingMs: blockMs, comparisonMs: compMs, emMs: Math.round(emMs) },
    stats: { inputRows: records.length, blockedPairs: blockedRows, scoredPairs: scoredRows.length },
  };
}

// ─── EM training on JS sample ─────────────────────────────────────

function trainEMOnSample(
  records: ReadonlyArray<Record<string, unknown>>,
  config: PipelineConfig,
): FSParameters {
  const defaults: FSParameters = {
    lambda: 0.5,
    mProbabilities: new Map([['default:match', 0.9]]),
    uProbabilities: new Map([['default:match', 0.1]]),
  } as unknown as FSParameters;

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
        generateComparisonVectors(a, b, config.comparisons as never, fieldMeta as never),
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
  const fallbackField = (config.blocking?.fields?.[0] ?? cols[0] ?? '__row_id') as string;
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

function dbFn(n: string): string {
  return n === 'jaro_winkler' ? 'jaro_winkler_similarity' : 'damerau_levenshtein';
}
function esc(n: string): string {
  return n.replace(/"/g, '""');
}
async function dropAll(be: ISqlBackend, ts: string[]): Promise<void> {
  for (const t of ts)
    try {
      await be.dropTempTable(t);
    } catch {}
}
