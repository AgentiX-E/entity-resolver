/**
 * Splink-style composable blocking rules.
 *
 * Enables declarative blocking rule construction with boolean
 * composition (And, Or, Not) and fluent API (blockOn, exactMatch).
 *
 * Inspired by Splink's BlockingRuleCreator / block_on API.
 */

import type { CandidatePair, BlockingResult, BlockingPass, BlockingTransform } from './types.js';

// ══════════════════════════════════════════════════════════════
// Blocking Rule AST
// ══════════════════════════════════════════════════════════════

/** A single field-value based blocking predicate. */
export interface BlockingPredicate {
  /** Blocking key from a record's field. */
  blockKey(record: Record<string, unknown>): string | null;
}

// ══════════════════════════════════════════════════════════════
// Rule builders
// ══════════════════════════════════════════════════════════════

/**
 * Create a blocking rule that blocks on exact field value (after optional transforms).
 *
 * Note: blockOn already exists in standard.ts. This version is for completeness
 * within the composable API. Use the standard.ts version for pipeline integration.
 */
export function blockOnField(
  field: string,
  transforms: readonly BlockingTransform[] = [],
): BlockingPass {
  return { fields: [field], transforms };
}

/**
 * Create a blocking rule that blocks on multiple fields concatenated.
 * Records match if ALL fields have identical values.
 */
export function blockOnAll(
  fields: readonly string[],
  transforms: readonly BlockingTransform[] = [],
): BlockingPass {
  return { fields, transforms };
}

/**
 * Combine blocking passes with AND semantics (intersection of pairs).
 * Each pass generates candidates independently, then pairs are filtered
 * to those appearing in ALL passes.
 */
export function andBlocking(
  passes: readonly BlockingPass[],
): BlockingPass[] {
  // Mark passes as conjunctive — the caller (pipeline) must implement
  // the actual intersection logic
  return passes.map((p) => ({
    ...p,
    meta: { ...((p as any).meta ?? {}), conjunctive: true },
  }));
}

/**
 * Combine blocking passes with OR semantics (union of pairs).
 * This is the default behavior — each pass adds more candidate pairs.
 */
export function orBlocking(
  passes: readonly BlockingPass[],
): BlockingPass[] {
  return passes.map((p) => ({
    ...p,
    meta: { ...((p as any).meta ?? {}), conjunctive: false },
  }));
}

// ══════════════════════════════════════════════════════════════
// Boolean composition on candidate pairs
// ══════════════════════════════════════════════════════════════

/**
 * Apply AND composition: keep only pairs that appear in ALL result sets.
 */
export function intersectPairs(
  results: readonly BlockingResult[],
): BlockingResult {
  if (results.length === 0) {
    return { pairs: [], blockCount: 0, totalRecords: 0, reductionRatio: 1 };
  }
  if (results.length === 1) return results[0]!;

  // Build frequency map across all result sets
  const pairFreq = new Map<string, { count: number; pair: CandidatePair }>();
  for (const result of results) {
    const seen = new Set<string>(); // dedup within single result
    for (const pair of result.pairs) {
      const key = `${pair.leftId}:${pair.rightId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const entry = pairFreq.get(key);
        if (entry) {
          entry.count++;
        } else {
          pairFreq.set(key, { count: 1, pair });
        }
      }
    }
  }

  // Keep only pairs that appear in ALL result sets
  const pairs: CandidatePair[] = [];
  for (const [, entry] of pairFreq) {
    if (entry.count >= results.length) {
      pairs.push(entry.pair);
    }
  }

  const total = results[0]!.totalRecords;
  const totalPossible = (total * (total - 1)) / 2;
  return {
    pairs,
    blockCount: results.reduce((s, r) => s + r.blockCount, 0),
    totalRecords: total,
    reductionRatio: totalPossible > 0 ? 1 - pairs.length / totalPossible : 1,
  };
}

/**
 * Apply OR composition: union of all result sets (deduplicated).
 */
export function unionPairs(
  results: readonly BlockingResult[],
): BlockingResult {
  const seen = new Set<string>();
  const pairs: CandidatePair[] = [];
  let totalRecords = 0;
  let totalBlocks = 0;

  for (const result of results) {
    totalRecords = Math.max(totalRecords, result.totalRecords);
    totalBlocks += result.blockCount;
    for (const pair of result.pairs) {
      const key = `${pair.leftId}:${pair.rightId}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push(pair);
      }
    }
  }

  const totalPossible = (totalRecords * (totalRecords - 1)) / 2;
  return {
    pairs,
    blockCount: totalBlocks,
    totalRecords,
    reductionRatio: totalPossible > 0 ? 1 - pairs.length / totalPossible : 1,
  };
}

/**
 * Apply NOT composition: exclude pairs from excludeResults that appear in includeResult.
 */
export function subtractPairs(
  includeResult: BlockingResult,
  excludeResults: readonly BlockingResult[],
): BlockingResult {
  const excludeSet = new Set<string>();
  for (const result of excludeResults) {
    for (const pair of result.pairs) {
      excludeSet.add(`${pair.leftId}:${pair.rightId}`);
    }
  }

  const pairs = includeResult.pairs.filter(
    (p) => !excludeSet.has(`${p.leftId}:${p.rightId}`),
  );

  const total = includeResult.totalRecords;
  const totalPossible = (total * (total - 1)) / 2;
  return {
    pairs,
    blockCount: includeResult.blockCount,
    totalRecords: total,
    reductionRatio: totalPossible > 0 ? 1 - pairs.length / totalPossible : 1,
  };
}
