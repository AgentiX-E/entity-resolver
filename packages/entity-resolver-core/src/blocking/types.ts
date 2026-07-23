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
      case 'soundex':
        result = computeSoundex(result);
        break;
      case 'metaphone':
        result = computeMetaphone(result);
        break;
      default:
        break;
    }
  }
  return result;
}

// ─── Soundex encoding ────────────────────────────────────────────

const SOUNDEX_MAP: Record<string, number> = {
  B: 1,
  F: 1,
  P: 1,
  V: 1,
  C: 2,
  G: 2,
  J: 2,
  K: 2,
  Q: 2,
  S: 2,
  X: 2,
  Z: 2,
  D: 3,
  T: 3,
  L: 4,
  M: 5,
  N: 5,
  R: 6,
};

function computeSoundex(value: string): string {
  const s = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '0000';
  const first = s[0]!;
  let code = first;
  let prev = SOUNDEX_MAP[first] ?? 0;
  for (let i = 1; i < s.length && code.length < 4; i++) {
    const digit = SOUNDEX_MAP[s[i]!] ?? 0;
    if (digit !== 0 && digit !== prev) {
      code += String(digit);
    }
    prev = digit;
  }
  return (code + '000').slice(0, 4);
}

// ─── Metaphone encoding (simplified) ──────────────────────────────

function computeMetaphone(value: string): string {
  const s = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '';
  // Simplified Metaphone: keep first char, drop vowels, dedupe
  let result = s[0]!;
  let prev = s[0]!;
  for (let i = 1; i < s.length; i++) {
    const ch = s[i]!;
    if ('AEIOU'.includes(ch)) continue;
    if (ch === prev) continue;
    result += ch;
    prev = ch;
  }
  return result.slice(0, 6);
}
