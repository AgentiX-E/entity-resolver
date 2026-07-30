/**
 * SQL Pipeline Engine — Full DuckDB pushdown (blocking→comparison→scoring→EM).
 *
 * Generates and executes complete SQL for all pipeline stages.
 * EM parameter estimation delegates to existing sql-em.ts module
 * (JS-controlled EM iterations with SQL data access).
 *
 * DuckDB native functions used for string comparison:
 *   jaro_winkler_similarity, damerau_levenshtein, levenshtein
 */
import type { FSParameters } from '../fellegi-sunter/parameters.js';
import type { ComparisonSpec, ComparisonVector } from '../matching/comparison.js';
import type { PipelineConfig } from './runner.js';
import type { ISqlBackend, SqlRow } from '../interfaces/ISqlBackend.js';
import { sqlEstimateParameters } from '../fellegi-sunter/sql-em.js';

export interface SqlPipelineResult {
  pairs: Array<{ leftId: number; rightId: number; score: number }>;
  timing: { blockingMs: number; comparisonMs: number; scoringMs: number; emMs: number };
  stats: { inputRows: number; blockedPairs: number; scoredPairs: number };
}

export async function runSqlPipeline(
  records: ReadonlyArray<Record<string, unknown>>,
  config: PipelineConfig,
  backend: ISqlBackend,
): Promise<SqlPipelineResult> {
  const cols = Object.keys(records[0] ?? {});
  const inputTable = `__er_in_${Date.now()}`;

  // Add records with auto-increment row_id
  const recordsWithId = records.map((r, i) => ({ __row_id: i, ...r }));
  await backend.createTempTable(recordsWithId, { name: inputTable });

  // Use __row_id for join keys

  // Stage 1: SQL blocking
  const t0 = performance.now();
  const blockedTable = `__er_bl_${Date.now()}`;
  const blockSql = buildBlockSql(inputTable, blockedTable, config, cols);
  await backend.exec(blockSql);
  const blockedRows = await backend.rowCount(blockedTable);
  const blockMs = performance.now() - t0;

  if (blockedRows === 0) {
    await dropAll(backend, [inputTable, blockedTable]);
    return {
      pairs: [],
      timing: { blockingMs: blockMs, comparisonMs: 0, scoringMs: 0, emMs: 0 },
      stats: { inputRows: records.length, blockedPairs: 0, scoredPairs: 0 },
    };
  }

  // Stage 2: SQL comparison (CASE/WHEN)
  const t1 = performance.now();
  const compTable = `__er_cp_${Date.now()}`;
  const compSql = buildCompSql(inputTable, blockedTable, compTable, config.comparisons, cols);
  console.error('[SQL-PIPELINE] Comp SQL:', compSql.slice(0, 600));
  try {
    await backend.exec(compSql);
    const rows = await backend.rowCount(compTable);
    console.error('[SQL-PIPELINE] Comp table rows:', rows);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Comparison SQL failed: ${msg}\nSQL: ${compSql.slice(0, 300)}`);
  }
  const compMs = performance.now() - t1;

  // Stage 3: EM parameter estimation
  const t2 = performance.now();
  const cvRows = await backend.query(`SELECT * FROM ${compTable}`);
  const pairVectors = toComparisonVectors(cvRows, config.comparisons, cols);

  let parameters: FSParameters;
  try {
    const emResult = await sqlEstimateParameters(backend, pairVectors, {
      maxIterations: 10,
      tableName: compTable,
    });
    parameters = emResult.parameters;
  } catch {
    parameters = {
      lambda: 0.5,
      mProbabilities: new Map(),
      uProbabilities: new Map(),
    } as unknown as FSParameters;
  }
  const emMs = performance.now() - t2;

  // Stage 4: SQL scoring
  const t3 = performance.now();
  const scoredSql = buildScoredSql(compTable, config.comparisons, cols, parameters);
  const scoredRows = await backend.query(scoredSql);
  const scoringMs = performance.now() - t3;

  await dropAll(backend, [inputTable, blockedTable, compTable]);

  return {
    pairs: scoredRows.map((r: SqlRow) => ({
      leftId: Number(r.left_id),
      rightId: Number(r.right_id),
      score: Number(r.match_weight ?? 0.5),
    })),
    timing: { blockingMs: blockMs, comparisonMs: compMs, emMs, scoringMs },
    stats: { inputRows: records.length, blockedPairs: blockedRows, scoredPairs: scoredRows.length },
  };
}

// ─── SQL generators ────────────────────────────────────────────────

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

function buildCompSql(
  src: string,
  blk: string,
  dst: string,
  comps: readonly ComparisonSpec[],
  cols: readonly string[],
): string {
  const active = comps.filter((c) => cols.includes(c.field));
  if (active.length === 0)
    return `CREATE TABLE ${dst} AS SELECT left_id, right_id, 'default' AS d_level, 0.5 AS d_score FROM ${blk}`;

  const exprs = active
    .map((c) => {
      const f = esc(c.field);
      const lvls = c.levels && c.levels.length > 0 ? c.levels : [{ name: 'default' }];
      let caseSql = 'CASE ';
      for (let i = lvls.length - 1; i >= 0; i--) {
        const l = lvls[i]!;
        if ((l as Record<string, unknown>).isExact)
          caseSql += `WHEN l."${f}" = r."${f}" THEN ${i} `;
        else if ((l as Record<string, unknown>).isNull)
          caseSql += `WHEN l."${f}" IS NULL OR r."${f}" IS NULL THEN ${i} `;
        else
          caseSql += `WHEN ${dbFn(c.scorerName)}(l."${f}", r."${f}") >= ${(l as Record<string, unknown>).threshold ?? 0.7} THEN ${i} `;
      }
      caseSql += `ELSE -1 END AS ${f}_level`;
      return caseSql;
    })
    .join(',\n');

  return `CREATE TABLE ${dst} AS SELECT b.left_id, b.right_id,\n${exprs}\nFROM ${blk} b JOIN ${src} l ON l.__row_id=b.left_id JOIN ${src} r ON r.__row_id=b.right_id`;
}

function buildScoredSql(
  compTbl: string,
  comps: readonly ComparisonSpec[],
  cols: readonly string[],
  params: FSParameters,
): string {
  const active = comps.filter((c) => cols.includes(c.field));
  const weights = active
    .map((c) => {
      const f = esc(c.field);
      // Extract best m/u for this field from FSParameters
      let m = 0.9,
        u = 0.1;
      for (const [key, val] of params.mProbabilities) {
        if (key.startsWith(c.field + ':')) {
          m = Math.max(m, val);
        }
      }
      for (const [key, val] of params.uProbabilities) {
        if (key.startsWith(c.field + ':')) {
          u = Math.max(u, val);
        }
      }
      const mw = Math.log2(Math.max(m, 0.001) / Math.max(u, 0.001));
      const nmw = Math.log2(Math.max(1 - m, 0.001) / Math.max(1 - u, 0.001));
      return `CASE WHEN ${f}_level>=0 THEN ${mw.toFixed(4)} ELSE ${nmw.toFixed(4)} END AS ${f}_weight`;
    })
    .join(',\n');
  const sums = active.map((c) => `COALESCE(${esc(c.field)}_weight, 0)`).join(' + ');
  return `SELECT left_id, right_id,\n${weights},\n(${sums}) AS match_weight\nFROM ${compTbl}`;
}

// ─── Type conversion ───────────────────────────────────────────────

function toComparisonVectors(
  rows: SqlRow[],
  comps: readonly ComparisonSpec[],
  cols: readonly string[],
): ComparisonVector[][] {
  return rows.map((r) =>
    comps
      .filter((c) => cols.includes(c.field))
      .map((c) => ({
        field: c.field,
        level: String(r[`${c.field}_level`] ?? -1),
        score: 0.5,
        scorer: c.scorerName,
      })),
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function dbFn(name: string): string {
  switch (name) {
    case 'jaro_winkler':
      return 'jaro_winkler_similarity';
    case 'levenshtein':
      return 'damerau_levenshtein';
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
