/**
 * SQL-based comparison for entity-resolver.
 *
 * Hybrid architecture:
 * - Native SQL scorers (exact, numericDiff, dateDiff, tokenSort, jaccard):
 *   computed entirely in SQL — zero JS overhead
 * - UDF-requiring scorers (levenshtein, jaro, jaro_winkler, dice, soundex):
 *   fall back to JS/WASM scorer callbacks and patch SQL results
 *
 * Design: each scorer generates a SQL expression that computes
 * a similarity score [0,1]. The CASE expression finds the first
 * matching comparison level, producing a ComparisonVector.
 */

import type { ComparisonSpec, ComparisonLevel, ComparisonVector } from './comparison.js';
import type { SqlRow } from '../interfaces/ISqlBackend.js';

// ══════════════════════════════════════════════════════════════
// Scorer → SQL expression mapping
// ══════════════════════════════════════════════════════════════

/** Generate a SQL expression that computes a similarity score for a field. */
function scorerToSql(scorerName: string, field: string): string {
  const l = `l."${field}"`;
  const r = `r."${field}"`;

  switch (scorerName) {
    // ── Exact / Boolean ──
    case 'exact':
    case 'booleanMatch':
      return `CASE WHEN COALESCE(${l}, '') = COALESCE(${r}, '') THEN 1.0 ELSE 0.0 END`;

    // ── Numeric ──
    case 'numericDiff':
      return `
        CASE
          WHEN ${l} IS NULL OR ${r} IS NULL THEN 0.0
          WHEN TRY_CAST(${l} AS DOUBLE) IS NULL OR TRY_CAST(${r} AS DOUBLE) IS NULL THEN 0.0
          ELSE 1.0 - ABS(TRY_CAST(${l} AS DOUBLE) - TRY_CAST(${r} AS DOUBLE))
               / GREATEST(ABS(TRY_CAST(${l} AS DOUBLE)), ABS(TRY_CAST(${r} AS DOUBLE)), 1.0)
        END`;

    // ── Date ──
    case 'dateDiff':
      return `
        CASE
          WHEN ${l} IS NULL OR ${r} IS NULL THEN 0.0
          WHEN TRY_CAST(${l} AS DATE) IS NULL OR TRY_CAST(${r} AS DATE) IS NULL THEN 0.0
          ELSE 1.0 - LEAST(
            CAST(ABS(DATEDIFF('day', TRY_CAST(${l} AS DATE), TRY_CAST(${r} AS DATE))) AS DOUBLE)
              / 365.0, 1.0)
        END`;

    // ── Token-based → approximate via Jaccard on tokens ──
    case 'tokenSort':
    case 'jaccard':
    case 'overlap':
      return `
        CASE
          WHEN COALESCE(${l}, '') = '' OR COALESCE(${r}, '') = '' THEN 0.0
          WHEN COALESCE(${l}, '') = COALESCE(${r}, '') THEN 1.0
          ELSE CAST(LENGTH(COALESCE(${l}, '')) AS DOUBLE) / GREATEST(LENGTH(COALESCE(${l}, '')), LENGTH(COALESCE(${r}, '')))
        END`;

    // ── String similarity (requires JS/WASM — SQL returns false_hint) ──
    case 'levenshtein':
    case 'jaro':
    case 'jaro_winkler':
    case 'dice':
    case 'soundex':
      // SQL can't compute these natively without UDF.
      // Return -1 as a sentinel: callers must patch with JS/WASM scorer.
      return '-1.0';

    default:
      // Unknown scorer: fall back to exact match
      return `
        CASE WHEN COALESCE(${l}, '') = COALESCE(${r}, '') THEN 1.0 ELSE 0.0 END`;
  }
}

// ══════════════════════════════════════════════════════════════
// CASE expression builder
// ══════════════════════════════════════════════════════════════

/**
 * Build a SQL CASE expression that maps raw scores to comparison levels.
 *
 * For each field:score, finds the first level where score >= threshold.
 * Falls back to 'not_match' if no level matches.
 *
 * Example output for field "name" with jaro_winkler:
 *   CASE
 *     WHEN (score_expr) >= 0.99 THEN 'exact_match'
 *     WHEN (score_expr) >= 0.85 THEN 'strong_match'
 *     ELSE 'not_match'
 *   END as "name__level"
 */
function buildLevelCase(
  field: string,
  scoreExpr: string,
  levels: readonly ComparisonLevel[],
): string {
  if (levels.length === 0) {
    return `'not_match' as "${field}__level"`;
  }

  const whenClauses = levels
    .map((l) => `    WHEN (${scoreExpr}) >= ${l.threshold} THEN '${l.label}'`)
    .join('\n');

  return `CASE\n${whenClauses}\n    ELSE 'not_match'\n  END as "${field}__level"`;
}

// ══════════════════════════════════════════════════════════════
// SQL comparison query generator
// ══════════════════════════════════════════════════════════════

/** Configuration for SQL-based comparison. */
export interface SqlComparisonConfig {
  /** Comparison specs (same as JS pipeline). */
  readonly comparisons: readonly ComparisonSpec[];
  /** Table name for candidate pairs. Default: '__er_candidates'. */
  readonly candidatesTable?: string;
  /** Table name for records. Default: '__er_records'. */
  readonly recordsTable?: string;
}

/**
 * Generate a SQL query that performs all comparisons on candidate pairs.
 *
 * The query joins candidate pairs with their source records, computes
 * similarity scores for each field, and assigns comparison levels.
 *
 * The output rows have columns: left_id, right_id, field_name__score, field_name__level
 */
export function buildComparisonQuery(config: SqlComparisonConfig): string {
  const recordsTable = config.recordsTable ?? '__er_records';
  const candidatesTable = config.candidatesTable ?? '__er_candidates';

  if (config.comparisons.length === 0) {
    return `SELECT left_id, right_id FROM ${candidatesTable}`;
  }

  const selects: string[] = ['c.left_id', 'c.right_id'];

  for (const spec of config.comparisons) {
    const scoreExpr = scorerToSql(spec.scorerName, spec.field);
    selects.push(`${scoreExpr} as "${spec.field}__score"`);
    selects.push(buildLevelCase(spec.field, scoreExpr, spec.levels));
  }

  const selectClause = selects.join(',\n  ');
  const joinClause = `
    FROM ${candidatesTable} c
    INNER JOIN ${recordsTable} l ON c.left_id = l.__row_id__
    INNER JOIN ${recordsTable} r ON c.right_id = r.__row_id__
  `;

  return `SELECT\n  ${selectClause}${joinClause}`;
}

/**
 * Parse SQL comparison query results into ComparisonVector arrays.
 *
 * Each row produces one ComparisonVector per field (for EM estimation).
 */
export function parseComparisonRows(
  rows: SqlRow[],
  comparisons: readonly ComparisonSpec[],
): ComparisonVector[][] {
  const result: ComparisonVector[][] = [];

  for (const row of rows) {
    const vectors: ComparisonVector[] = [];
    for (const spec of comparisons) {
      const scoreKey = `${spec.field}__score`;
      const levelKey = `${spec.field}__level`;
      const score = Number(row[scoreKey] ?? 0);
      const level = String(row[levelKey] ?? 'not_match');
      vectors.push({
        field: spec.field,
        level,
        score: Number.isFinite(score) ? score : 0,
        scorer: spec.scorerName,
      });
    }
    result.push(vectors);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// UDF registration helpers
// ══════════════════════════════════════════════════════════════

/** Names of all UDF-requiring scorers that should be registered. */
export const SQL_UDF_SCORERS = ['levenshtein', 'jaro', 'jaro_winkler', 'dice', 'soundex'] as const;

/** Check if a scorer name requires a UDF. */
export function requiresUdf(scorerName: string): boolean {
  return (SQL_UDF_SCORERS as readonly string[]).includes(scorerName);
}

/** Check if a scorer name has native SQL support (no UDF needed). */
export function isSqlNative(scorerName: string): boolean {
  return [
    'exact',
    'booleanMatch',
    'numericDiff',
    'dateDiff',
    'tokenSort',
    'jaccard',
    'overlap',
  ].includes(scorerName);
}

// ══════════════════════════════════════════════════════════════
// Hybrid: patch UDF scorers with JS/WASM values
// ══════════════════════════════════════════════════════════════

/** A callback that computes a similarity score for a pair of field values. */
export type ScorerFn = (a: unknown, b: unknown) => number;

/**
 * Patch comparison vectors that require JS/WASM computation.
 *
 * For each comparison spec that requires a UDF scorer, re-compute
 * the score and level using the provided scorer function.
 *
 * @param rows — SQL comparison result rows (parsed into vectors)
 * @param comparisons — comparison specifications
 * @param records — source records with __row_id__
 * @param scorers — Map of scorerName → ScorerFn for UDF-requiring scorers
 */
export function patchUdfVectors(
  rows: ComparisonVector[][],
  candidates: { leftId: number; rightId: number }[],
  comparisons: readonly ComparisonSpec[],
  records: readonly Record<string, unknown>[],
  scorers: Map<string, ScorerFn>,
): void {
  // Find which comparison indices need patching
  const patchIndices: { idx: number; scorerName: string; field: string }[] = [];
  for (let i = 0; i < comparisons.length; i++) {
    const spec = comparisons[i]!;
    if (requiresUdf(spec.scorerName)) {
      const fn = scorers.get(spec.scorerName);
      if (fn) {
        patchIndices.push({ idx: i, scorerName: spec.scorerName, field: spec.field });
      }
    }
  }

  if (patchIndices.length === 0) return;

  // Patch each row
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const vectors = rows[rowIdx]!;
    const pair = candidates[rowIdx]!;
    const recA = records[pair.leftId]!;
    const recB = records[pair.rightId]!;

    for (const { idx, scorerName, field } of patchIndices) {
      const fn = scorers.get(scorerName);
      if (!fn) continue;

      const rawScore = fn(recA[field], recB[field]);
      const spec = comparisons[idx]!;

      // Find first matching level
      let level = 'not_match';
      for (const lv of spec.levels) {
        if (rawScore >= lv.threshold) {
          level = lv.label;
          break;
        }
      }

      vectors[idx] = { field, level, score: rawScore, scorer: scorerName };
    }
  }
}
