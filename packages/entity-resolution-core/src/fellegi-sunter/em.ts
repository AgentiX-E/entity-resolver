// Expectation-Maximization (EM) algorithm for Fellegi-Sunter parameter estimation.
// Estimates m-probability and u-probability from unlabeled comparison vectors.

import type { ComparisonVector } from '../matching/comparison.js';
import { extractComparisonKeys, createDefaultParameters, freezeParameters } from './parameters.js';
import type { FSParameters } from './parameters.js';

/** Configuration for the EM algorithm. */
export interface EMOptions {
  /** Maximum number of iterations (default: 30). */
  readonly maxIterations?: number;
  /** Convergence threshold: stop when delta log-likelihood < epsilon. */
  readonly epsilon?: number;
  /** Random seed for reproducibility. */
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
}

/**
 * Run the EM algorithm to estimate Fellegi-Sunter parameters
 * from a set of comparison vectors.
 *
 * @param vectors - Comparison vectors from candidate pairs
 * @param options - EM configuration
 * @returns Estimated parameters and convergence diagnostics
 */
export function estimateParameters(
  vectors: readonly ComparisonVector[],
  options: EMOptions = {},
): EMResult {
  const { maxIterations = 30, epsilon = 1e-6 } = options;

  if (vectors.length === 0) {
    throw new Error('Cannot estimate parameters from empty vector set');
  }

  // Extract all field:level keys
  const keys = extractComparisonKeys(vectors);

  // Initialize parameters
  const params = createDefaultParameters(keys);

  // Convert to mutable for iteration
  const state = {
    lambda: params.lambda,
    mProbabilities: new Map(params.mProbabilities),
    uProbabilities: new Map(params.uProbabilities),
  };

  const logLikelihoodHistory: number[] = [];
  let converged = false;
  let iteration = 0;

  // Build a map of vectors grouped by comparison key
  const vectorMap = buildVectorMap(vectors, keys);

  for (iteration = 0; iteration < maxIterations; iteration++) {
    // E-step: compute posterior match probability for each vector group
    const posteriors = eStep(vectorMap, state, keys);

    // M-step: re-estimate m and u parameters
    mStep(vectorMap, posteriors, state, keys);

    // Compute log-likelihood for convergence check
    const ll = computeLogLikelihood(vectorMap, state, keys);
    logLikelihoodHistory.push(ll);

    // Check convergence
    if (iteration > 0) {
      const prevLL = logLikelihoodHistory[iteration - 1]!;
      if (Math.abs(ll - prevLL) < epsilon) {
        converged = true;
        break;
      }
    }
  }

  return {
    parameters: freezeParameters(state),
    iterations: iteration + 1,
    converged,
    logLikelihood: logLikelihoodHistory[logLikelihoodHistory.length - 1]!,
    logLikelihoodHistory,
  };
}

// ─── Internal helpers ──────────────────────────────────────────

interface VectorGroup {
  /** Total count of vectors in this group. */
  count: number;
  /** Count where the field matches (score >= some threshold — not used directly in EM). */
  matchCount: number;
}

function buildVectorMap(
  vectors: readonly ComparisonVector[],
  keys: readonly string[],
): Map<string, VectorGroup> {
  const map = new Map<string, VectorGroup>();

  // Initialize empty groups for all keys
  for (const key of keys) {
    map.set(key, { count: 0, matchCount: 0 });
  }

  // Count vectors per group
  for (const v of vectors) {
    const fieldKey = `${v.field}:${v.level}`;
    const group = map.get(fieldKey) ?? { count: 0, matchCount: 0 };
    group.count++;
    // A "match" in EM terms: did the comparison score meet a threshold?
    // For the EM algorithm, we treat any comparison as "observed" if the
    // score meets the comparison level's threshold.
    if (v.score >= 0.5) {
      group.matchCount++;
    }
    map.set(fieldKey, group);
  }

  return map;
}

function eStep(
  vectorMap: Map<string, VectorGroup>,
  state: {
    lambda: number;
    mProbabilities: Map<string, number>;
    uProbabilities: Map<string, number>;
  },
  _keys: readonly string[],
): Map<string, number> {
  // Compute posterior P(match | observations) for the entire dataset
  // using current m/u parameters

  let totalMatchLogProb = 0;
  let totalNonMatchLogProb = 0;

  for (const [key, group] of vectorMap) {
    const m = state.mProbabilities.get(key) ?? 0.5;
    const u = state.uProbabilities.get(key) ?? 0.1;

    // Log-probabilities for numerical stability
    const logM = safeLog(m);
    const log1MinusM = safeLog(1 - m);
    const logU = safeLog(u);
    const log1MinusU = safeLog(1 - u);

    // For matches in this group
    totalMatchLogProb += group.matchCount * logM + (group.count - group.matchCount) * log1MinusM;
    totalNonMatchLogProb += group.matchCount * logU + (group.count - group.matchCount) * log1MinusU;
  }

  const logPrior = safeLog(state.lambda);
  const log1MinusPrior = safeLog(1 - state.lambda);

  const logNumerator = logPrior + totalMatchLogProb;
  const logDenominator = logSumExp(
    logPrior + totalMatchLogProb,
    log1MinusPrior + totalNonMatchLogProb,
  );

  const posterior = Math.exp(logNumerator - logDenominator);

  // Return a single global posterior for the dataset
  const posteriors = new Map<string, number>();
  posteriors.set('_global', posterior);
  return posteriors;
}

function mStep(
  vectorMap: Map<string, VectorGroup>,
  _posteriors: Map<string, number>,
  state: {
    lambda: number;
    mProbabilities: Map<string, number>;
    uProbabilities: Map<string, number>;
  },
  _keys: readonly string[],
): void {
  // M-step: re-estimate m and u parameters
  // For each field:level, m = (matchCount + alpha) / (totalCount + alpha + beta)
  // u = (nonMatchCount + alpha) / (nonMatchTotalCount + alpha + beta)
  // Using Laplace smoothing (alpha=1) to prevent zero probabilities

  const alpha = 1; // Laplace smoothing
  const beta = 1;

  for (const [key, group] of vectorMap) {
    // Estimate m: probability of observation given match
    const m = (group.matchCount + alpha) / (group.count + alpha + beta);
    state.mProbabilities.set(key, clampProb(m));

    // Estimate u: probability of observation given non-match
    // Total non-match observations = total vectors - matchCount
    const nonMatchObs = group.count - group.matchCount;
    const u = (nonMatchObs + alpha) / (group.count + alpha + beta);
    state.uProbabilities.set(key, clampProb(u));
  }

  // Update lambda: proportion of true matches in the dataset
  // Simplified estimate: average m-probability for high-signal fields
  const mLowest = Math.min(...state.mProbabilities.values());
  const uHighest = Math.max(...state.uProbabilities.values());
  state.lambda = clampProb((state.lambda + (1 - uHighest) / (mLowest + 1 - uHighest)) / 2);
}

function computeLogLikelihood(
  vectorMap: Map<string, VectorGroup>,
  state: {
    lambda: number;
    mProbabilities: Map<string, number>;
    uProbabilities: Map<string, number>;
  },
  _keys: readonly string[],
): number {
  let ll = 0;

  const logPrior = safeLog(state.lambda);
  const log1MinusPrior = safeLog(1 - state.lambda);

  for (const [key, group] of vectorMap) {
    const m = state.mProbabilities.get(key) ?? 0.5;
    const u = state.uProbabilities.get(key) ?? 0.1;

    // Log-likelihood for match case
    const matchLL =
      group.matchCount * safeLog(m) + (group.count - group.matchCount) * safeLog(1 - m) + logPrior;

    // Log-likelihood for non-match case
    const nonMatchLL =
      group.matchCount * safeLog(u) +
      (group.count - group.matchCount) * safeLog(1 - u) +
      log1MinusPrior;

    ll += logSumExp(matchLL, nonMatchLL);
  }

  return ll;
}

// ─── Numerical stability helpers ───────────────────────────────

/** Safe log: returns a large negative number instead of -Infinity. */
function safeLog(x: number): number {
  if (x <= 0) return -1e10;
  return Math.log(x);
}

/** Log-sum-exp for numerical stability. */
function logSumExp(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const max = Math.max(a, b);
  return max + Math.log(Math.exp(a - max) + Math.exp(b - max));
}

/** Clamp a probability to (0, 1) with safeguards against edge values. */
function clampProb(p: number): number {
  if (p <= 0) return 1e-6;
  if (p >= 1) return 1 - 1e-6;
  return p;
}
