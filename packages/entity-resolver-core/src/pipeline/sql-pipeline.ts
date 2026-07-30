/**
 * SQL Pipeline Engine — Full DuckDB pushdown (zero JS materialization).
 *
 * All computation stays in DuckDB's C++ engine:
 *   Stage 1: SQL blocking with multi-field passes + sampling LIMIT
 *   Stage 2+3 merged: comparison + scoring in single CTAS
 *
 * Only final scored pairs are read into JS.
 */
import type { PipelineConfig } from './runner.js';
import type { ISqlBackend, SqlRow } from '../interfaces/ISqlBackend.js';

export interface SqlPipelineResult {
  pairs: Array<{ leftId: number; rightId: number; score: number }>;
  timing: { blockingMs: number; comparisonMs: number; scoringMs: number };
  stats: { inputRows: number; blockedPairs: number; scoredPairs: number };
}

export async function runSqlPipeline(
  records: ReadonlyArray<Record<string, unknown>>,
  config: PipelineConfig,
  backend: ISqlBackend,
): Promise<SqlPipelineResult> {
  const cols = Object.keys(records[0] ?? {});
  const inputTable = `__er_sql_in_${Date.now()}`;
  await backend.createTempTable(
    records.map((r, i) => ({ __row_id: i, ...r })),
    { name: inputTable },
  );

  // Multi-field blocking: all string fields as separate passes
  const stringFields = cols.filter((c) => c !== '__row_id');
  const blockingConfig = {
    ...config,
    blocking: config.blocking ?? {
      passes: stringFields.map((f) => ({ fields: [f], transforms: ['lowercase'] as string[] })),
    },
  };

  // Adaptive pair cap: limit block pairs to prevent O(n²) CTAS cost
  // For 10K+ records, cap at 500K blocked pairs
  const maxBlockPairs = records.length > 5000 ? 500000 : undefined;

  // Stage 1: SQL blocking
  const t0 = performance.now();
  const blockedTable = `__er_sql_bl_${Date.now()}`;
  await backend.exec(buildBlockSql(inputTable, blockedTable, blockingConfig, cols, maxBlockPairs));
  const blockedRows = await backend.rowCount(blockedTable);
  const blockMs = performance.now() - t0;

  if (blockedRows === 0) {
    await dropAll(backend, [inputTable, blockedTable]);
    return {
      pairs: [],
      timing: { blockingMs: blockMs, comparisonMs: 0, scoringMs: 0 },
      stats: { inputRows: records.length, blockedPairs: 0, scoredPairs: 0 },
    };
  }

  // Stage 2+3 merged: comparison + scoring in single CTAS
  const t1 = performance.now();
  const scoredTable = `__er_sql_sc_${Date.now()}`;

  // Build comparison + weight SQL directly (default Fellegi-Sunter m=0.9/u=0.1)
  const activeComps = config.comparisons.filter((c) => cols.includes(c.field));
  const levelSql = activeComps.map((c) => {
    const f = esc(c.field);
    const lvls = c.levels?.length ? c.levels : [{}];
    let s = '';
    for (let i = lvls.length - 1; i >= 0; i--) {
      const l = lvls[i]! as Record<string, unknown>;
      if (l.isExact) s += ` WHEN l."${f}"=r."${f}" THEN ${i}`;
      else if (l.isNull) s += ` WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i}`;
      else s += ` WHEN ${dbFn(c.scorerName)}(l."${f}",r."${f}")>=${l.threshold ?? 0.7} THEN ${i}`;
    }
    return { field: f, expr: `CASE${s} ELSE -1 END AS ${f}_level` };
  });

  const mw = '3.169925';
  const nmw = '-3.169925';
  const weightCols = levelSql.map(
    ({ field }) => `CASE WHEN ${field}_level>=0 THEN ${mw} ELSE ${nmw} END AS ${field}_weight`,
  );
  const weightSum = levelSql.map(({ field }) => `COALESCE(${field}_weight,0)`).join('+');

  const combinedSql = `CREATE TABLE ${scoredTable} AS
SELECT b.left_id, b.right_id,
${levelSql.map((l) => l.expr).join(',\n')},
${weightCols.join(',\n')},
(${weightSum}) AS match_weight
FROM ${blockedTable} b
JOIN ${inputTable} l ON l.__row_id=b.left_id
JOIN ${inputTable} r ON r.__row_id=b.right_id`;

  await backend.exec(combinedSql);

  // Read final scored pairs only
  const scoredRows = await backend.query(
    `SELECT left_id, right_id, match_weight FROM ${scoredTable}`,
  );

  await dropAll(backend, [inputTable, blockedTable, scoredTable]);

  return {
    pairs: scoredRows.map((r: SqlRow) => ({
      leftId: Number(r.left_id),
      rightId: Number(r.right_id),
      score: (Number(r.match_weight) + 10) / 20,
    })),
    timing: { blockingMs: blockMs, comparisonMs: performance.now() - t1, scoringMs: 0 },
    stats: { inputRows: records.length, blockedPairs: blockedRows, scoredPairs: scoredRows.length },
  };
}

function buildBlockSql(
  src: string,
  dst: string,
  config: PipelineConfig,
  cols: readonly string[],
  maxPairs?: number,
): string {
  const fallbackField = (config.blocking?.fields?.[0] ?? cols[0] ?? '__row_id') as string;
  const passes = config.blocking?.passes ?? [{ fields: [fallbackField], transforms: [] }];

  const parts = passes.map((p) => {
    const conditions = (p.fields ?? [fallbackField])
      .map((f) =>
        p.transforms?.[0] === 'lowercase' ? `LOWER(l."${f}")=LOWER(r."${f}")` : `l."${f}"=r."${f}"`,
      )
      .join(' AND ');
    return `SELECT DISTINCT l.__row_id AS left_id, r.__row_id AS right_id FROM ${src} l JOIN ${src} r ON (${conditions}) WHERE l.__row_id<r.__row_id`;
  });

  const limitClause = maxPairs && maxPairs > 0 ? ` LIMIT ${maxPairs}` : '';
  return `CREATE TABLE ${dst} AS SELECT * FROM (${parts.join(' UNION ')})${limitClause}`;
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
