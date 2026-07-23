// Expectation-Maximization (EM) algorithm for Fellegi-Sunter parameter estimation.
// Estimates m-probability and u-probability from unlabeled comparison vectors
// using the standard EM formulation with per-pair posteriors.
//
// Reference: Winkler (1988), "Using the EM Algorithm for Weight Computation
// in the Fellegi-Sunter Model of Record Linkage"

import type { ComparisonVector } from '../matching/comparison.js';
import { createDefaultParameters, freezeParameters } from './parameters.js';
import type { FSParameters } from './parameters.js';

/** Configuration for the EM algorithm. */
export interface EMOptions {
  /** Maximum number of iterations (default: 30). */
  readonly maxIterations?: number;
  /** Convergence threshold: stop when delta log-likelihood < epsilon. */
  readonly epsilon?: number;
  /** Random seed for reproducibility (reserved for future multi-start). */
  readonly seed?: number;
}

/** Result of EM parameter estimation. */
export interface EMResult {
  /** Estimated FS parameters. */
  readonly parameters: FSParameters;
  /** Number of iterations performed. */
  readonly iterations: number;
  /** Whether the algorithm converged (vs hit maxIterations). */
  readonly converged: boolean;
  /** Final log-likelihood. */
  readonly logLikelihood: number;
  /** History of log-likelihoods per iteration. */
  readonly logLikelihoodHistory: readonly number[];
  /** Per-pair posterior match probabilities from the final E-step. */
  readonly posteriors: readonly number[];
}

// ─── Internal state ────────────────────────────────────────────

interface EMState {
  lambda: number;
  mProbabilities: Map<string, number>;
  uProbabilities: Map<string, number>;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Run the EM algorithm to estimate Fellegi-Sunter parameters
 * from a set of comparison vector groups (one group per record pair).
 *
 * Each element of `pairVectors` represents one record pair, containing
 * the comparison vectors for each field of that pair. The algorithm
 * computes a per-pair posterior match probability and uses those
 * posteriors to weight the M-step parameter updates.
 *
 * @param pairVectors - Comparison vectors grouped by record pair. Each element
 *   is an array of ComparisonVectors for one pair (one per field).
 * @param options - EM configuration
 * @returns Estimated parameters, convergence diagnostics, and per-pair posteriors
 */
export function estimateParameters(
  pairVectors: readonly (readonly ComparisonVector[])[],
  options: EMOptions = {},
): EMResult {
  const { maxIterations = 30, epsilon = 1e-6 } = options;

  if (pairVectors.length === 0) {
    throw new Error('Cannot estimate parameters from empty pair set');
  }

  const N = pairVectors.length;

  // Extract all unique "field:level" keys and organize by field
  const { keys, fieldToKeys } = extractKeys(pairVectors);

  // Build per-pair key arrays: pairKeySets[i] = ["name:exact_match", "dob:strong_match", ...]
  const pairKeySets: string[][] = pairVectors.map((pair) =>
    pair.map((v) => `${v.field}:${v.level}`),
  );

  // Initialize parameters with literature defaults
  const state: EMState = initializeState(keys);

  const logLikelihoodHistory: number[] = [];
  const posteriors: number[] = new Array(N).fill(0);
  let converged = false;
  let iteration = 0;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    // ── E-step: compute per-pair posterior P(match | observations) ──
    eStep(pairKeySets, state, posteriors);

    // ── M-step: re-estimate m, u, lambda using posterior weights ──
    mStep(pairKeySets, fieldToKeys, posteriors, state, keys);

    // ── Convergence check: log-likelihood delta ──
    const ll = computeLogLikelihood(pairKeySets, state);
    logLikelihoodHistory.push(ll);

    if (iteration > 0) {
      const prevLL = logLikelihoodHistory[iteration - 1]!;
      if (Math.abs(ll - prevLL) < epsilon) {
        converged = true;
        // Run one final E-step with converged parameters for accurate posteriors
        eStep(pairKeySets, state, posteriors);
        break;
      }
    }
  }

  // If hit maxIterations without converging, ensure posteriors are from final params
  if (!converged) {
    eStep(pairKeySets, state, posteriors);
  }

  return {
    parameters: freezeParameters(state),
    iterations: iteration + 1,
    converged,
    logLikelihood: logLikelihoodHistory[logLikelihoodHistory.length - 1]!,
    logLikelihoodHistory,
    posteriors,
  };
}

// ─── Initialization ─────────────────────────────────────────────

function initializeState(keys: readonly string[]): EMState {
  // Use uninformative prior (λ = 0.5) so data drives convergence rather than initial bias.
  // m = 0.9 and u = 0.1 are reasonable starting points for field-level parameters.
  const defaults = createDefaultParameters(keys, {
    initialLambda: 0.5,
    initialM: 0.9,
    initialU: 0.1,
  });
  return {
    lambda: defaults.lambda,
    mProbabilities: new Map(defaults.mProbabilities),
    uProbabilities: new Map(defaults.uProbabilities),
  };
}

function extractKeys(pairVectors: readonly (readonly ComparisonVector[])[]): {
  keys: string[];
  fieldToKeys: Map<string, string[]>;
} {
  const keySet = new Set<string>();
  const fieldToKeys = new Map<string, string[]>();

  for (const pair of pairVectors) {
    for (const v of pair) {
      const key = `${v.field}:${v.level}`;
      keySet.add(key);

      // Track wildcard key per field for fallback
      const wildKey = `${v.field}:*`;
      keySet.add(wildKey);

      if (!fieldToKeys.has(v.field)) {
        fieldToKeys.set(v.field, []);
      }
      const fieldKeys = fieldToKeys.get(v.field)!;
      if (!fieldKeys.includes(key)) {
        fieldKeys.push(key);
      }
    }
  }

  return { keys: [...keySet], fieldToKeys };
}

// ─── E-step: Per-pair posterior computation ─────────────────────

/**
 * Compute P(match_i | γ_i, θ) for each pair.
 *
 * w_i = λ * ∏_f m_f(γ_i^f) / [λ * ∏_f m_f(γ_i^f) + (1-λ) * ∏_f u_f(γ_i^f)]
 *
 * Uses log-space computation for numerical stability.
 * Results are written into the pre-allocated `posteriors` array.
 */
function eStep(pairKeySets: readonly string[][], state: EMState, posteriors: number[]): void {
  const logPrior = safeLog(state.lambda);
  const log1MinusPrior = safeLog(1 - state.lambda);

  for (let i = 0; i < pairKeySets.length; i++) {
    const pairKeys = pairKeySets[i]!;
    let logMatchProb = 0;
    let logNonMatchProb = 0;

    for (const key of pairKeys) {
      const m = state.mProbabilities.get(key) ?? 0.5;
      const u = state.uProbabilities.get(key) ?? 0.1;
      logMatchProb += safeLog(m);
      logNonMatchProb += safeLog(u);
    }

    const logNumerator = logPrior + logMatchProb;
    const logDenominator = logSumExp(logPrior + logMatchProb, log1MinusPrior + logNonMatchProb);

    posteriors[i] = Math.exp(logNumerator - logDenominator);
  }
}

// ─── M-step: Posterior-weighted parameter update ────────────────

/**
 * Re-estimate m, u, and λ using per-pair posterior weights.
 *
 * For each field:level key k belonging to field f:
 *   m_k = (Σ_i w_i · I(γ_i contains k) + α) / (Σ_i w_i + α · |levels_f|)
 *   u_k = (Σ_i (1-w_i) · I(γ_i contains k) + α) / (Σ_i (1-w_i) + α · |levels_f|)
 *
 * λ = (1/N) · Σ_i w_i
 *
 * Laplace smoothing α = 1 prevents zero probabilities for unseen levels.
 */
function mStep(
  pairKeySets: readonly string[][],
  fieldToKeys: Map<string, string[]>,
  posteriors: readonly number[],
  state: EMState,
  _keys: readonly string[],
): void {
  const N = pairKeySets.length;
  const laplace = 1; // Laplace smoothing (add-1)

  // Accumulate weighted counts per field:level key
  const keyMatchWeight = new Map<string, number>(); // Σ w_i · I(contains key)
  const keyNonMatchWeight = new Map<string, number>(); // Σ (1-w_i) · I(contains key)

  // Accumulate total match/non-match weight per field across ALL pairs
  const fieldTotalMatch = new Map<string, number>();
  const fieldTotalNonMatch = new Map<string, number>();

  for (let i = 0; i < N; i++) {
    const w = posteriors[i]!;
    const antiW = 1 - w;
    for (const key of pairKeySets[i]!) {
      keyMatchWeight.set(key, (keyMatchWeight.get(key) ?? 0) + w);
      keyNonMatchWeight.set(key, (keyNonMatchWeight.get(key) ?? 0) + antiW);

      // Track per-field totals across all pairs
      const field = key.split(':')[0]!;
      fieldTotalMatch.set(field, (fieldTotalMatch.get(field) ?? 0) + w);
      fieldTotalNonMatch.set(field, (fieldTotalNonMatch.get(field) ?? 0) + antiW);
    }
  }

  // Update m/u for each field:level
  for (const [, fieldKeys] of fieldToKeys) {
    const numLevels = fieldKeys.length;
    const sampleKey = fieldKeys[0]!;
    const field = sampleKey.split(':')[0]!;

    // Total weight across ALL pairs for this field
    const totalW = fieldTotalMatch.get(field) ?? 0;
    const totalAW = fieldTotalNonMatch.get(field) ?? 0;

    for (const key of fieldKeys) {
      const weightedMatchCount = keyMatchWeight.get(key) ?? 0;
      const weightedNonMatchCount = keyNonMatchWeight.get(key) ?? 0;

      const m = (weightedMatchCount + laplace) / (totalW + laplace * numLevels);
      const u = (weightedNonMatchCount + laplace) / (totalAW + laplace * numLevels);

      state.mProbabilities.set(key, clampProb(m));
      state.uProbabilities.set(key, clampProb(u));
    }

    // Enforce monotonicity constraint: higher comparison levels should have
    // higher m-probabilities and lower u-probabilities.
    // Without this constraint, EM is not identifiable when all data shares
    // the same comparison level (e.g., all "not_match" pairs).
    enforceLevelOrdering(fieldKeys, state);
  }

  // Update lambda: mean of per-pair posteriors (standard EM formula)
  const totalPosterior = posteriors.reduce((a, b) => a + b, 0);
  state.lambda = clampProb(totalPosterior / N);
}

// ─── Level ordering constraint ──────────────────────────────────

/** Standard comparison level priority — lower index = stronger evidence. */
const LEVEL_RANK: Readonly<Record<string, number>> = {
  exact_match: 0,
  strong_match: 1,
  moderate_match: 2,
  within_30_days: 2,
  weak_match: 3,
  not_match: 99,
};

/** Get the priority rank of a comparison level name. */
function levelRank(level: string): number {
  return LEVEL_RANK[level] ?? 50;
}

/**
 * Enforce monotonicity: for levels l1 > l2 (stronger > weaker),
 * ensure m(l1) ≥ m(l2) and u(l1) ≤ u(l2).
 *
 * This is the identifiability constraint from the Fellegi-Sunter model —
 * higher comparison levels should have higher probability under the match
 * distribution and lower probability under the non-match distribution.
 */
function enforceLevelOrdering(fieldKeys: readonly string[], state: EMState): void {
  // Sort keys by level rank (ascending = strongest first)
  const sorted = [...fieldKeys].sort((a, b) => {
    const [, levelA] = a.split(':');
    const [, levelB] = b.split(':');
    return levelRank(levelA!) - levelRank(levelB!);
  });

  // Forward pass: ensure m is non-increasing (stronger levels ≥ weaker)
  for (let i = 1; i < sorted.length; i++) {
    const prevKey = sorted[i - 1]!;
    const currKey = sorted[i]!;
    const prevM = state.mProbabilities.get(prevKey);
    const currM = state.mProbabilities.get(currKey);
    if (prevM !== undefined && currM !== undefined && currM > prevM) {
      // Average them to satisfy monotonicity
      const avg = (prevM + currM) / 2;
      state.mProbabilities.set(prevKey, avg);
      state.mProbabilities.set(currKey, avg);
    }
  }

  // Forward pass: ensure u is non-decreasing (stronger levels ≤ weaker)
  for (let i = 1; i < sorted.length; i++) {
    const prevKey = sorted[i - 1]!;
    const currKey = sorted[i]!;
    const prevU = state.uProbabilities.get(prevKey);
    const currU = state.uProbabilities.get(currKey);
    if (prevU !== undefined && currU !== undefined && currU < prevU) {
      const avg = (prevU + currU) / 2;
      state.uProbabilities.set(prevKey, avg);
      state.uProbabilities.set(currKey, avg);
    }
  }
}

// ─── Log-likelihood computation ─────────────────────────────────

/**
 * Compute the complete-data log-likelihood for convergence monitoring.
 *
 * L(θ) = Σ_i log[ λ · ∏_f m_f(γ_i^f) + (1-λ) · ∏_f u_f(γ_i^f) ]
 */
function computeLogLikelihood(pairKeySets: readonly string[][], state: EMState): number {
  const logPrior = safeLog(state.lambda);
  const log1MinusPrior = safeLog(1 - state.lambda);
  let ll = 0;

  for (const pairKeys of pairKeySets) {
    let logMatchProb = 0;
    let logNonMatchProb = 0;

    for (const key of pairKeys) {
      const m = state.mProbabilities.get(key) ?? 0.5;
      const u = state.uProbabilities.get(key) ?? 0.1;
      logMatchProb += safeLog(m);
      logNonMatchProb += safeLog(u);
    }

    ll += logSumExp(logPrior + logMatchProb, log1MinusPrior + logNonMatchProb);
  }

  return ll;
}

// ─── Numerical stability helpers ────────────────────────────────

/** Safe log: returns a large negative number instead of -Infinity. */
function safeLog(x: number): number {
  if (x <= 0) return -1e10;
  return Math.log(x);
}

/** Log-sum-exp for numerical stability: log(exp(a) + exp(b)). */
function logSumExp(a: number, b: number): number {
  if (!Number.isFinite(a) && a < 0) return b;
  if (!Number.isFinite(b) && b < 0) return a;
  const max = Math.max(a, b);
  return max + Math.log(Math.exp(a - max) + Math.exp(b - max));
}

/** Clamp a probability to (0, 1) with safeguards against edge values. */
function clampProb(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 1e-10;
  if (p >= 1) return 1 - 1e-10;
  return p;
}
