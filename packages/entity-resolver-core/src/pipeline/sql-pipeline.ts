/**
 * SQL Pipeline Engine — Full DuckDB pushdown (zero JS materialization).
 *
 * All computation stays in DuckDB's C++ engine:
 *   Stage 1: SQL blocking (self-join)
 *   Stage 2+3 merged: comparison + scoring in single CTAS
 *
 * Only final scored pairs are read into JS — matching Splink's
 * `keep everything in SQL` design.
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
  const recordsWithId = records.map((r, i) => ({ __row_id: i, ...r }));
  await backend.createTempTable(recordsWithId, { name: inputTable });

  // Stage 1: SQL blocking
  const t0 = performance.now();
  const blockedTable = `__er_sql_bl_${Date.now()}`;
  await backend.exec(buildBlockSql(inputTable, blockedTable, config, cols));
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

  // Stage 2 + 3 merged: comparison + scoring in a single CTAS pipeline
  // No EM — use default m=0.9, u=0.1 (m-step is expensive and gives marginal gains)
  const t1 = performance.now();
  const scoredTable = `__er_sql_sc_${Date.now()}`;

  // Build a single SQL that: blocking join → comparisons → match weights → final table
  const activeComparisons = config.comparisons.filter((c) => cols.includes(c.field));
  const caseExprs = activeComparisons.map((c) => {
    const f = esc(c.field);
    const lvls = c.levels && c.levels.length > 0 ? c.levels : [{}];
    let sql = 'CASE ';
    for (let i = lvls.length - 1; i >= 0; i--) {
      const l = lvls[i]! as Record<string, unknown>;
      if (l.isExact) sql += `WHEN l."${f}" = r."${f}" THEN ${i} `;
      else if (l.isNull) sql += `WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i} `;
      else
        sql += `WHEN ${dbFn(c.scorerName)}(l."${f}", r."${f}") >= ${l.threshold ?? 0.7} THEN ${i} `;
    }
    sql += 'ELSE -1 END';
    return { field: f, expr: sql };
  });

  const weightExprs = caseExprs.map(({ field }) => {
    // Default Fellegi-Sunter weights (m=0.9, u=0.1 for match; m=0.1, u=0.9 for no-match)
    const mw = '3.169925'; // log2(0.9/0.1)
    const nmw = '-3.169925'; // log2(0.1/0.9)
    return `CASE WHEN ${field}_level >= 0 THEN ${mw} ELSE ${nmw} END AS ${field}_weight`;
  });

  const caseSelects = caseExprs.map(({ field, expr }) => `${expr} AS ${field}_level`);
  const weightSelects = weightExprs;
  const weightSum = caseExprs.map(({ field }) => `COALESCE(${field}_weight, 0)`).join(' + ');

  const combinedSql = `CREATE TABLE ${scoredTable} AS
SELECT b.left_id, b.right_id,
${caseSelects.join(',\n')},
${weightSelects.join(',\n')},
(${weightSum}) AS match_weight
FROM ${blockedTable} b
JOIN ${inputTable} l ON l.__row_id = b.left_id
JOIN ${inputTable} r ON r.__row_id = b.right_id`;

  await backend.exec(combinedSql);
  const compMs = performance.now() - t1;

  // Read final scored pairs only (no intermediate materialization)
  const t2 = performance.now();
  const scoredRows = await backend.query(
    `SELECT left_id, right_id, match_weight FROM ${scoredTable}`,
  );

  await dropAll(backend, [inputTable, blockedTable, scoredTable]);

  const totalMs = performance.now() - t0;
  return {
    pairs: scoredRows.map((r: SqlRow) => ({
      leftId: Number(r.left_id),
      rightId: Number(r.right_id),
      score: (Number(r.match_weight) + 10) / 20, // Normalize to [0,1]
    })),
    timing: { blockingMs: blockMs, comparisonMs: compMs, scoringMs: totalMs - blockMs - compMs },
    stats: { inputRows: records.length, blockedPairs: blockedRows, scoredPairs: scoredRows.length },
  };
}

// ─── SQL generators (same as before, kept for clarity) ────────────

function buildBlockSql(
  src: string,
  dst: string,
  config: PipelineConfig,
  cols: readonly string[],
): string {
  const fallbackField = (config.blocking?.fields?.[0] ?? cols[0] ?? '__row_id') as string;
  const passes = config.blocking?.passes ?? [
    { fields: [fallbackField], transforms: config.blocking?.transforms ?? [] },
  ];

  const parts = passes.map((p) => {
    const conditions = (p.fields ?? [cols[0] ?? '__row_id'])
      .map((f) =>
        p.transforms?.[0] === 'lowercase'
          ? `LOWER(l."${f}") = LOWER(r."${f}")`
          : `l."${f}" = r."${f}"`,
      )
      .join(' AND ');
    return `SELECT DISTINCT l.__row_id AS left_id, r.__row_id AS right_id FROM ${src} l JOIN ${src} r ON (${conditions}) WHERE l.__row_id < r.__row_id`;
  });
  return `CREATE TABLE ${dst} AS ${parts.join(' UNION ')}`;
}

// ─── Helpers ───────────────────────────────────────────────────────

function dbFn(name: string): string {
  switch (name) {
    case 'jaro_winkler':
      return 'jaro_winkler_similarity';
    case 'levenshtein':
    default:
      return 'damerau_levenshtein';
  }
}

function esc(n: string): string {
  return n.replace(/"/g, '""');
}

async function dropAll(backend: ISqlBackend, tables: string[]): Promise<void> {
  for (const t of tables) {
    try {
      await backend.dropTempTable(t);
    } catch {
      /* ignore */
    }
  }
}
