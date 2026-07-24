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
  readonly maxIterations?: number;
  readonly epsilon?: number;
  readonly seed?: number;
  readonly numRestarts?: number;
  /**
   * Maximum number of pairs to use for EM training.
   * When set, pairs are deterministically sampled (hash-based) to cap
   * training data size. This enables EM to run on large datasets without
   * O(N²) memory. Uses Splink-style hash-based sampling for reproducibility.
   * Default: undefined (no cap — uses all pairs).
   */
  readonly maxPairs?: number;
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

  // Splink-style hash-based deterministic sampling for large datasets
  const { maxPairs } = options;
  let effectiveVectors = pairVectors;

  if (maxPairs && maxPairs > 0 && pairVectors.length > maxPairs) {
    // Deterministic hash-based sampling: keep pairs where hash(leftId, rightId) < threshold
    const sampleRatio = maxPairs / pairVectors.length;
    const sampledVectors: ComparisonVector[][] = [];
    
    for (let i = 0; i < pairVectors.length; i++) {
      if (simpleHash32(i) < sampleRatio * 0xffffffff) {
        sampledVectors.push(pairVectors[i] as ComparisonVector[]);
      }
    }
    // Ensure at least 2 pairs for meaningful estimation
    if (sampledVectors.length < 2 && pairVectors.length >= 2) {
      sampledVectors.push(pairVectors[0] as ComparisonVector[], pairVectors[1] as ComparisonVector[]);
    }
    
    effectiveVectors = sampledVectors;
  } else {
    effectiveVectors = pairVectors;
  }

  // Extract all unique "field:level" keys and organize by field
  const { keys, fieldToKeys } = extractKeys(effectiveVectors);

  // Build per-pair key arrays
  const pairKeySets: string[][] = effectiveVectors.map((pair) =>
    pair.map((v) => `${v.field}:${v.level}`),
  );
  const N = effectiveVectors.length;

  // Helper: run EM iterations for a given state, return diagnostics
  const runEMLoop = (
    state: EMState,
  ): {
    converged: boolean;
    iterations: number;
    logLikelihood: number;
    logLikelihoodHistory: number[];
    posteriors: number[];
  } => {
    const localLLHistory: number[] = [];
    const localPosteriors: number[] = new Array(N).fill(0);
    let localConverged = false;
    let localIter = 0;

    for (localIter = 0; localIter < maxIterations; localIter++) {
      eStep(pairKeySets, state, localPosteriors);
      mStep(pairKeySets, fieldToKeys, localPosteriors, state, keys);

      const ll = computeLogLikelihood(pairKeySets, state);
      localLLHistory.push(ll);

      if (localIter > 0) {
        const prevLL = localLLHistory[localIter - 1]!;
        if (Math.abs(ll - prevLL) < epsilon) {
          localConverged = true;
          eStep(pairKeySets, state, localPosteriors);
          break;
        }
      }
    }

    if (!localConverged) {
      eStep(pairKeySets, state, localPosteriors);
    }

    return {
      converged: localConverged,
      iterations: localIter + 1,
      logLikelihood: localLLHistory[localLLHistory.length - 1]!,
      logLikelihoodHistory: localLLHistory,
      posteriors: localPosteriors,
    };
  };

  // Initial run
  let bestState: EMState = initializeState(keys);
  let bestResult = runEMLoop(bestState);
  let bestIteration = bestResult.iterations;

  // Multi-start: run EM from additional random initializations
  // and select the result with the highest log-likelihood
  const numRestarts = options.numRestarts ?? 1;
  for (let r = 1; r < numRestarts; r++) {
    const restartedState = initializeState(keys, {
      initialM: 0.7 + Math.random() * 0.2,
      initialU: 0.05 + Math.random() * 0.15,
      initialLambda: 0.001 + Math.random() * 0.01,
    });

    const restartedResult = runEMLoop(restartedState);

    if (restartedResult.logLikelihood > bestResult.logLikelihood) {
      bestState = restartedState;
      bestResult = restartedResult;
      bestIteration = restartedResult.iterations;
    }
  }

  return {
    parameters: freezeParameters(bestState),
    iterations: bestIteration,
    converged: bestResult.converged,
    logLikelihood: bestResult.logLikelihood,
    logLikelihoodHistory: bestResult.logLikelihoodHistory,
    posteriors: bestResult.posteriors,
  };
}

// ─── Initialization ─────────────────────────────────────────────

function initializeState(
  keys: readonly string[],
  overrides?: { initialM?: number; initialU?: number; initialLambda?: number },
): EMState {
  const defaults = createDefaultParameters(keys, {
    initialLambda: overrides?.initialLambda ?? 0.5,
    initialM: overrides?.initialM ?? 0.9,
    initialU: overrides?.initialU ?? 0.1,
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
  // ── PAVA for m-probabilities ──
  // Sort weakest-first (rank descending) so that the monotonicity constraint
  // m_weak <= m_strong maps naturally to PAVA's non-decreasing enforcement.
  const mLevels = [...fieldKeys].sort((a, b) => {
    const [, levelA] = a.split(':');
    const [, levelB] = b.split(':');
    return levelRank(levelB!) - levelRank(levelA!);
  });

  const mBlocks: Array<{ indices: number[]; avgValue: number; totalWeight: number }> = [];
  for (let i = 0; i < mLevels.length; i++) {
    const key = mLevels[i]!;
    const mVal = state.mProbabilities.get(key) ?? 0.5;
    mBlocks.push({ indices: [i], avgValue: mVal, totalWeight: 1 });

    // Merge backward while violation exists (PAVA)
    while (mBlocks.length >= 2) {
      const last = mBlocks[mBlocks.length - 1]!;
      const prev = mBlocks[mBlocks.length - 2]!;
      if (prev.avgValue <= last.avgValue) break; // Monotonic ✓

      const merged = {
        indices: [...prev.indices, ...last.indices],
        avgValue:
          (prev.avgValue * prev.totalWeight + last.avgValue * last.totalWeight) /
          (prev.totalWeight + last.totalWeight),
        totalWeight: prev.totalWeight + last.totalWeight,
      };
      mBlocks.splice(mBlocks.length - 2, 2, merged);
    }
  }

  for (const block of mBlocks) {
    for (const idx of block.indices) {
      state.mProbabilities.set(mLevels[idx]!, block.avgValue);
    }
  }

  // ── PAVA for u-probabilities ──
  // Sort strongest-first (rank ascending) so that the monotonicity constraint
  // u_strong <= u_weak maps to PAVA's non-decreasing enforcement.
  const uLevels = [...fieldKeys].sort((a, b) => {
    const [, levelA] = a.split(':');
    const [, levelB] = b.split(':');
    return levelRank(levelA!) - levelRank(levelB!);
  });

  const uBlocks: Array<{ indices: number[]; avgValue: number; totalWeight: number }> = [];
  for (let i = 0; i < uLevels.length; i++) {
    const key = uLevels[i]!;
    const uVal = state.uProbabilities.get(key) ?? 0.1;
    uBlocks.push({ indices: [i], avgValue: uVal, totalWeight: 1 });

    while (uBlocks.length >= 2) {
      const last = uBlocks[uBlocks.length - 1]!;
      const prev = uBlocks[uBlocks.length - 2]!;
      if (prev.avgValue <= last.avgValue) break; // Monotonic ✓

      const merged = {
        indices: [...prev.indices, ...last.indices],
        avgValue:
          (prev.avgValue * prev.totalWeight + last.avgValue * last.totalWeight) /
          (prev.totalWeight + last.totalWeight),
        totalWeight: prev.totalWeight + last.totalWeight,
      };
      uBlocks.splice(uBlocks.length - 2, 2, merged);
    }
  }

  for (const block of uBlocks) {
    for (const idx of block.indices) {
      state.uProbabilities.set(uLevels[idx]!, block.avgValue);
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

/** @internal Safe log: returns a large negative number instead of -Infinity. */
export function safeLog(x: number): number {
  if (x <= 0) return -1e10;
  return Math.log(x);
}

/** @internal Log-sum-exp for numerical stability: log(exp(a) + exp(b)). */
export function logSumExp(a: number, b: number): number {
  if (!Number.isFinite(a) && a < 0) return b;
  if (!Number.isFinite(b) && b < 0) return a;
  const max = Math.max(a, b);
  return max + Math.log(Math.exp(a - max) + Math.exp(b - max));
}

/** @internal Clamp a probability to (0, 1) with safeguards against edge values. */
export function clampProb(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 1e-10;
  if (p >= 1) return 1 - 1e-10;
  return p;
}

/** Simple 32-bit hash for deterministic pair sampling (Splink-style). */
function simpleHash32(n: number): number {
  let h = n | 0;
  h = ((h ^ 61) ^ (h >>> 16)) * 9;
  h = h ^ (h >>> 4);
  h = h * 0x27d4eb2d;
  h = h ^ (h >>> 15);
  return h >>> 0;
}
