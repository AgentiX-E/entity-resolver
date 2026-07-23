// Match Weight calculator — Fellegi-Sunter match weight computation.
// Implements the log2 Bayes factor approach with term frequency adjustment.

import type { ComparisonVector } from '../matching/comparison.js';
import type { FSParameters } from './parameters.js';
import { validateParameters } from './parameters.js';

/**
 * Result of match weight calculation for a pair of records.
 */
export interface MatchWeightResult {
  /** Prior weight: log2(lambda / (1 - lambda)). */
  readonly priorWeight: number;
  /** Per-field match weights { fieldName: weight }. */
  readonly fieldWeights: ReadonlyMap<string, number>;
  /** Total match weight: prior + sum(fieldWeights). */
  readonly totalWeight: number;
  /** Match probability derived from totalWeight: 2^M / (1 + 2^M). */
  readonly probability: number;
}

/**
 * Compute the match weight for a comparison vector using
 * estimated FS parameters.
 *
 * Formula: M = log2(lambda/(1-lambda)) + sum(log2(m_i/u_i))
 * Probability = 2^M / (1 + 2^M)
 */
export function computeMatchWeight(
  vector: ComparisonVector,
  params: FSParameters,
): MatchWeightResult {
  validateParameters(params);

  const key = `${vector.field}:${vector.level}`;

  const m = params.mProbabilities.get(key);
  const u = params.uProbabilities.get(key);

  // If m/u not found for this specific level, fall back to field:*
  const fallbackKey = `${vector.field}:*`;
  const mVal = m ?? params.mProbabilities.get(fallbackKey);
  const uVal = u ?? params.uProbabilities.get(fallbackKey);

  if (mVal === undefined || uVal === undefined) {
    // No parameters available — neutral weight
    return {
      priorWeight: priorWeight(params.lambda),
      fieldWeights: new Map([[vector.field, 0]]),
      totalWeight: priorWeight(params.lambda),
      probability: weightToProbability(priorWeight(params.lambda)),
    };
  }

  // Bayes factor for this field: log2(m/u)
  const fieldWeight = safeLog2(mVal) - safeLog2(uVal);
  const priorWt = priorWeight(params.lambda);
  const totalWeight = priorWt + fieldWeight;

  return {
    priorWeight: priorWt,
    fieldWeights: new Map([[vector.field, fieldWeight]]),
    totalWeight,
    probability: weightToProbability(totalWeight),
  };
}

/**
 * Compute the aggregate match weight for a full set of comparison vectors.
 * Assumes field independence — match weights are additive across fields.
 */
export function computeAggregateMatchWeight(
  vectors: readonly ComparisonVector[],
  params: FSParameters,
): MatchWeightResult {
  validateParameters(params);

  const priorWt = priorWeight(params.lambda);
  const fieldWeights = new Map<string, number>();
  let totalWeight = priorWt;

  for (const vector of vectors) {
    const key = `${vector.field}:${vector.level}`;
    const m = params.mProbabilities.get(key);
    const u = params.uProbabilities.get(key);

    if (m !== undefined && u !== undefined && m > 0 && u > 0) {
      const fieldWeight = safeLog2(m) - safeLog2(u);
      fieldWeights.set(vector.field, fieldWeight);
      totalWeight += fieldWeight;
    }
  }

  return {
    priorWeight: priorWt,
    fieldWeights,
    totalWeight,
    probability: weightToProbability(totalWeight),
  };
}

/**
 * Convert a match weight to a match probability.
 * Formula: P = 2^M / (1 + 2^M)
 */
export function weightToProbability(weight: number): number {
  // Handle extreme values
  if (weight > 50) return 1;
  if (weight < -50) return 0;

  const pow2 = 2 ** weight;
  return pow2 / (1 + pow2);
}

/**
 * Convert a match probability to a match weight.
 * Formula: M = log2(P / (1 - P))
 */
export function probabilityToWeight(probability: number): number {
  const clamped = Math.max(1e-10, Math.min(1 - 1e-10, probability));
  return safeLog2(clamped / (1 - clamped));
}

/**
 * Compute prior weight from lambda.
 * Formula: M_prior = log2(lambda / (1 - lambda))
 */
export function priorWeight(lambda: number): number {
  return safeLog2(lambda) - safeLog2(1 - lambda);
}

/**
 * Interpreting match weights (for diagnostics):
 * - M = 0  → 50% probability
 * - M = 2  → ~80% probability
 * - M = 3  → ~90% probability
 * - M = 4  → ~95% probability
 * - M = 7  → ~99% probability
 */
export const MATCH_WEIGHT_INTERPRETATION = {
  NEUTRAL: 0,
  WEAK: 2,
  MODERATE: 3,
  STRONG: 4,
  VERY_STRONG: 7,
} as const;

// ─── Helpers ────────────────────────────────────────────────────

function safeLog2(x: number): number {
  if (x <= 0) return -50; // Very negative weight for impossible events
  return Math.log2(x);
}
