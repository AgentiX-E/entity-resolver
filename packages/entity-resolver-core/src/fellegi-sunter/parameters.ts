import { ValidationError } from '../errors/hierarchy.js';
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
 *
 * I41: Uses GoldenMatch-style exponential m-priors where higher-agreement
 * levels get exponentially more weight. This biases the EM toward
 * treating high-agreement observations as strong match evidence,
 * which is the correct prior for entity resolution.
 *
 * m[k] = 2^k / Σ(2^k)  where k=0 is the weakest level
 *
 * E.g., for 4 levels (exact, strong, moderate, weak):
 *   m = [1/15, 2/15, 4/15, 8/15] ≈ [0.067, 0.133, 0.267, 0.533]
 */
export function createDefaultParameters(
  comparisonKeys: readonly string[],
  options?: {
    readonly initialLambda?: number;
    readonly initialM?: number;
    readonly initialU?: number;
  },
): FSParameters {
  const { initialLambda = 0.001, initialM: _, initialU = 0.1 } = options ?? {};

  // I41: Group keys by field for per-field exponential m-priors
  const fieldLevels = new Map<string, string[]>();
  for (const key of comparisonKeys) {
    const colonIdx = key.indexOf(':');
    const field = colonIdx >= 0 ? key.slice(0, colonIdx) : key;
    const levels = fieldLevels.get(field) ?? [];
    levels.push(key);
    fieldLevels.set(field, levels);
  }

  const mProbabilities = new Map<string, number>();
  const uProbabilities = new Map<string, number>();

  // Laplace additive smoothing (I41: 1e-6, GoldenMatch standard)
  const SMOOTH = 1e-6;

  for (const [_field, keys] of fieldLevels) {
    const n = keys.length;

    // Exponential m-priors per field: m[k] = 2^k / Σ(2^k) + smoothing
    // Sort keys so that not_match (or weakest level) gets k=0
    const sorted = [...keys].sort((a, b) => {
      const aIsNot = a.endsWith(':not_match') || a.endsWith(':*');
      const bIsNot = b.endsWith(':not_match') || b.endsWith(':*');
      if (aIsNot && !bIsNot) return -1;
      if (!aIsNot && bIsNot) return 1;
      return 0;
    });

    const powers = sorted.map((_, k) => 2 ** k);
    const total = powers.reduce((s, p) => s + p, 0);

    for (let k = 0; k < sorted.length; k++) {
      const key = sorted[k]!;
      const rawM = (powers[k]! / total) + SMOOTH * n;
      mProbabilities.set(key, Math.min(rawM, 1.0 - SMOOTH));
      uProbabilities.set(key, Math.max(initialU + SMOOTH, SMOOTH));
    }
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
    throw new ValidationError(`lambda must be in (0, 1), got ${params.lambda}`);
  }

  for (const [key, m] of params.mProbabilities) {
    if (m < 0 || m > 1) {
      throw new ValidationError(`m-probability for "${key}" out of range: ${m}`);
    }
    const u = params.uProbabilities.get(key);
    if (u !== undefined && (u < 0 || u > 1)) {
      throw new ValidationError(`u-probability for "${key}" out of range: ${u}`);
    }
  }
}
