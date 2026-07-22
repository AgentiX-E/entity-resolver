// Blocking strategy types and interfaces.
// Blocking reduces O(n²) pairwise comparisons to near O(n).

import type { RecordId } from '../types/core.js';

/** A candidate pair of record IDs to be compared in the matching phase. */
export interface CandidatePair {
  readonly leftId: RecordId;
  readonly rightId: RecordId;
}

/** Configuration for a blocking strategy. */
export interface BlockingConfig {
  /** Fields to block on. */
  readonly fields?: readonly string[];
  /** Number of passes for multi-pass strategies. */
  readonly passes?: readonly BlockingPass[];
  /** Window size for sorted neighborhood. */
  readonly windowSize?: number;
  /** Transforms to apply to blocking keys. */
  readonly transforms?: readonly BlockingTransform[];
}

/** A single blocking pass in a multi-pass strategy. */
export interface BlockingPass {
  readonly fields: readonly string[];
  readonly transforms: readonly BlockingTransform[];
}

/** Transforms applied to blocking key values. */
export type BlockingTransform =
  | 'lowercase'
  | 'uppercase'
  | 'strip'
  | 'digits_only'
  | 'alpha_only'
  | 'soundex'
  | 'substring:0:3' // First 3 characters
  | 'substring:0:1' // First character
  | 'metaphone';

/** Result of a blocking operation. */
export interface BlockingResult {
  /** Candidate pairs generated. */
  readonly pairs: readonly CandidatePair[];
  /** Total records processed. */
  readonly totalRecords: number;
  /** Reduction ratio: 1 - (pairs / (n*(n-1)/2)). */
  readonly reductionRatio: number;
  /** This many clusters (blocks) were created. */
  readonly blockCount: number;
}

/**
 * Compute the blocking reduction ratio.
 * ratio = 1 - (pairs / totalPossiblePairs)
 * where totalPossiblePairs = n * (n - 1) / 2 for deduplication
 */
export function computeReductionRatio(pairCount: number, totalRecords: number): number {
  if (totalRecords <= 1) return 1;
  const totalPossiblePairs = (totalRecords * (totalRecords - 1)) / 2;
  if (totalPossiblePairs === 0) return 1;
  return 1 - pairCount / totalPossiblePairs;
}

/** Apply transforms to a field value for blocking key generation. */
export function applyBlockingTransforms(
  value: string,
  transforms: readonly BlockingTransform[],
): string {
  let result = value;
  for (const transform of transforms) {
    switch (transform) {
      case 'lowercase':
        result = result.toLowerCase();
        break;
      case 'uppercase':
        result = result.toUpperCase();
        break;
      case 'strip':
        result = result.trim();
        break;
      case 'digits_only':
        result = result.replace(/\D/g, '');
        break;
      case 'alpha_only':
        result = result.replace(/[^a-zA-Z]/g, '');
        break;
      case 'substring:0:3':
        result = result.slice(0, 3);
        break;
      case 'substring:0:1':
        result = result.slice(0, 1);
        break;
      default:
        break;
    }
  }
  return result;
}
