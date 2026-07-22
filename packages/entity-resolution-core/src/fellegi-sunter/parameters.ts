// Fellegi-Sunter probability model parameters.
// Represents m-probability, u-probability, and lambda (prior match probability).

import type { ComparisonVector } from '../matching/comparison.js';

/**
 * Fellegi-Sunter model parameters.
 *
 * m-probability: P(observation | records match) — measures data quality/reliability
 * u-probability: P(observation | records do not match) — measures coincidence/cardinality
 * lambda: P(match) — prior probability that any two records match
 */
export interface FSParameters {
  /** Prior match probability. Range: (0, 1). */
  readonly lambda: number;
  /**
   * m-probabilities keyed by "field:level".
   * E.g., "name:exact_match" => 0.95 means: when records match,
   * there's a 95% chance the name field is an exact match.
   */
  readonly mProbabilities: ReadonlyMap<string, number>;
  /**
   * u-probabilities keyed by "field:level".
   * E.g., "name:exact_match" => 0.01 means: when records DON'T match,
   * there's only a 1% chance the name field coincidentally matches exactly.
   */
  readonly uProbabilities: ReadonlyMap<string, number>;
}

/**
 * Default/initial parameters for EM algorithm.
 * Uses reasonable defaults based on Fellegi-Sunter literature.
 */
export function createDefaultParameters(
  comparisonKeys: readonly string[],
  options?: {
    readonly initialLambda?: number;
    readonly initialM?: number;
    readonly initialU?: number;
  },
): FSParameters {
  const { initialLambda = 0.001, initialM = 0.9, initialU = 0.1 } = options ?? {};

  const mProbabilities = new Map<string, number>();
  const uProbabilities = new Map<string, number>();

  for (const key of comparisonKeys) {
    mProbabilities.set(key, initialM);
    uProbabilities.set(key, initialU);
  }

  return {
    lambda: initialLambda,
    mProbabilities,
    uProbabilities,
  };
}

/**
 * Extract all unique "field:level" keys from a set of comparison vectors.
 */
export function extractComparisonKeys(vectors: readonly ComparisonVector[]): string[] {
  const keys = new Set<string>();
  for (const v of vectors) {
    keys.add(`${v.field}:${v.level}`);
    // Also add the field itself as a base key
    keys.add(`${v.field}:*`);
  }
  return [...keys];
}

/**
 * Clone FSParameters with mutable Maps for EM iteration.
 */
export function cloneParametersMutable(params: FSParameters): {
  lambda: number;
  mProbabilities: Map<string, number>;
  uProbabilities: Map<string, number>;
} {
  return {
    lambda: params.lambda,
    mProbabilities: new Map(params.mProbabilities),
    uProbabilities: new Map(params.uProbabilities),
  };
}

/**
 * Freeze mutable parameter maps into an immutable FSParameters.
 */
export function freezeParameters(params: {
  lambda: number;
  mProbabilities: Map<string, number>;
  uProbabilities: Map<string, number>;
}): FSParameters {
  return {
    lambda: params.lambda,
    mProbabilities: new Map(params.mProbabilities),
    uProbabilities: new Map(params.uProbabilities),
  };
}

/**
 * Validate that m/u parameters are physically meaningful.
 * In a valid FS model: m > u for exact_match levels (match evidence),
 * and m < u for not_match levels (non-match evidence).
 * Throws if parameters are invalid.
 */
export function validateParameters(params: FSParameters): void {
  if (params.lambda <= 0 || params.lambda >= 1) {
    throw new Error(`lambda must be in (0, 1), got ${params.lambda}`);
  }

  for (const [key, m] of params.mProbabilities) {
    if (m < 0 || m > 1) {
      throw new Error(`m-probability for "${key}" out of range: ${m}`);
    }
    const u = params.uProbabilities.get(key);
    if (u !== undefined && (u < 0 || u > 1)) {
      throw new Error(`u-probability for "${key}" out of range: ${u}`);
    }
  }
}
