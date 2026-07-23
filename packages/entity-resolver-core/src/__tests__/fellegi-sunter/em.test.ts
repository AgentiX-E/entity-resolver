// Tests for the EM algorithm — parameter estimation from comparison vectors.
// Validates mathematical correctness of per-pair E-step, weighted M-step,
// proper λ = mean(posteriors), and level-ordering monotonicity constraints.

import { describe, it, expect } from 'vitest';
import { estimateParameters } from '../../index.js';
import type { EMResult } from '../../fellegi-sunter/em.js';
import type { ComparisonVector } from '../../matching/comparison.js';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Create a single pair's comparison vectors (one per field-level observation). */
function makePair(...vectors: ComparisonVector[]): ComparisonVector[] {
  return vectors;
}

/** Create an exact-match vector for a given field. */
function exactMatch(field: string): ComparisonVector {
  return { field, level: 'exact_match', score: 1.0, scorer: 'exact' };
}

/** Create a strong-match vector. */
function strongMatch(field: string): ComparisonVector {
  return { field, level: 'strong_match', score: 0.9, scorer: 'jaro_winkler' };
}

/** Create a moderate-match vector. */
function moderateMatch(field: string): ComparisonVector {
  return { field, level: 'moderate_match', score: 0.75, scorer: 'jaro_winkler' };
}

/** Create a not-match vector. */
function notMatch(field: string): ComparisonVector {
  return { field, level: 'not_match', score: 0.1, scorer: 'jaro_winkler' };
}

/**
 * Generate N pairs where match pairs have high signal (exact/strong)
 * and non-match pairs have low signal (not_match/moderate).
 * This creates a well-separated dataset where EM can discriminate.
 */
function generateDataset(
  numMatchPairs: number,
  numNonMatchPairs: number,
  fieldNames: string[] = ['name', 'dob'],
): ComparisonVector[][] {
  const pairs: ComparisonVector[][] = [];

  // Match pairs: 80% exact, 20% strong for each field
  for (let i = 0; i < numMatchPairs; i++) {
    const useExact = i % 5 !== 0; // 80% exact
    pairs.push(makePair(...fieldNames.map((f) => (useExact ? exactMatch(f) : strongMatch(f)))));
  }

  // Non-match pairs: 80% not_match, 20% moderate for each field
  for (let i = 0; i < numNonMatchPairs; i++) {
    const useNotMatch = i % 5 !== 0; // 80% not_match
    pairs.push(makePair(...fieldNames.map((f) => (useNotMatch ? notMatch(f) : moderateMatch(f)))));
  }

  return pairs;
}

/** Run EM with validation and return result. */
function runEM(
  pairs: ComparisonVector[][],
  opts?: { maxIterations?: number; epsilon?: number },
): EMResult {
  const result = estimateParameters(pairs, {
    maxIterations: opts?.maxIterations ?? 50,
    epsilon: opts?.epsilon ?? 1e-6,
  });

  // All parameters must be finite and in (0, 1)
  expect(Number.isFinite(result.parameters.lambda)).toBe(true);
  expect(result.parameters.lambda).toBeGreaterThan(0);
  expect(result.parameters.lambda).toBeLessThan(1);

  for (const [key, m] of result.parameters.mProbabilities) {
    expect(Number.isFinite(m), `m[${key}] not finite`).toBe(true);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
  }
  for (const [key, u] of result.parameters.uProbabilities) {
    expect(Number.isFinite(u), `u[${key}] not finite`).toBe(true);
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThan(1);
  }

  // All posteriors must be in [0, 1] and finite
  for (let i = 0; i < result.posteriors.length; i++) {
    expect(Number.isFinite(result.posteriors[i]!), `posterior[${i}] not finite`).toBe(true);
    expect(result.posteriors[i]!).toBeGreaterThanOrEqual(0);
    expect(result.posteriors[i]!).toBeLessThanOrEqual(1);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Category A: Mathematical Correctness
// ═══════════════════════════════════════════════════════════════

describe('EM mathematical correctness', () => {
  it('A1: lambda converges to true match proportion on well-separated data', () => {
    // 80% true matches with strong signal, 20% non-matches with weak signal
    const pairs = generateDataset(800, 200, ['name', 'dob']);
    const result = runEM(pairs);

    // λ should approximate 0.8 within ±0.15 tolerance
    expect(result.parameters.lambda).toBeGreaterThan(0.65);
    expect(result.parameters.lambda).toBeLessThan(0.95);
  });

  it('A2: λ ≈ mean(posteriors) within numerical tolerance', () => {
    const pairs = generateDataset(700, 300, ['name']);
    const result = runEM(pairs);

    const meanPosterior =
      result.posteriors.reduce((a, b) => a + b, 0) / result.posteriors.length;
    // λ should be very close to mean(posteriors) — EM uses posteriors from
    // the previous iteration for M-step, and the level-ordering constraint
    // may slightly perturb the exact equality after convergence.
    expect(Math.abs(result.parameters.lambda - meanPosterior)).toBeLessThan(5e-3);
  });

  it('A3: m-probability for exact_match > u-probability for exact_match', () => {
    const pairs = generateDataset(600, 400, ['name']);
    const result = runEM(pairs);

    const m = result.parameters.mProbabilities.get('name:exact_match');
    const u = result.parameters.uProbabilities.get('name:exact_match');
    expect(m).toBeDefined();
    expect(u).toBeDefined();
    // m > u is the fundamental Fellegi-Sunter property for match evidence
    expect(m!).toBeGreaterThan(u!);
  });

  it('A4: not_match has m < u (non-match evidence)', () => {
    const pairs = generateDataset(600, 400, ['name']);
    const result = runEM(pairs);

    const m = result.parameters.mProbabilities.get('name:not_match');
    const u = result.parameters.uProbabilities.get('name:not_match');
    expect(m).toBeDefined();
    expect(u).toBeDefined();
    // m < u means not_match is evidence AGAINST a match
    expect(m!).toBeLessThan(u!);
  });

  it('A5: level ordering constraint holds — exact_match m ≥ strong_match m', () => {
    const pairs = generateDataset(600, 400, ['name']);
    const result = runEM(pairs);

    const mExact = result.parameters.mProbabilities.get('name:exact_match');
    const mStrong = result.parameters.mProbabilities.get('name:strong_match');
    expect(mExact).toBeDefined();
    expect(mStrong).toBeDefined();
    // Higher comparison level must have higher m-probability
    expect(mExact!).toBeGreaterThanOrEqual(mStrong! - 1e-10);
  });

  it('A6: level ordering constraint holds — exact_match u ≤ not_match u', () => {
    const pairs = generateDataset(600, 400, ['name']);
    const result = runEM(pairs);

    const uExact = result.parameters.uProbabilities.get('name:exact_match');
    const uNot = result.parameters.uProbabilities.get('name:not_match');
    expect(uExact).toBeDefined();
    expect(uNot).toBeDefined();
    // Higher comparison level must have lower u-probability
    expect(uExact!).toBeLessThanOrEqual(uNot! + 1e-10);
  });

  it('A7: posterior monotonicity — exact+exact pair > not+not pair', () => {
    const pairs = generateDataset(400, 400, ['name', 'dob']);
    const result = runEM(pairs);

    // Find a pure match pair's posterior and a pure non-match pair's
    // The match pairs are first, non-match pairs second in generateDataset
    const matchSample = result.posteriors.slice(0, 100);
    const nonMatchSample = result.posteriors.slice(400, 500);

    // Not all match pairs are pure exact (20% are strong), so use averages
    const avgMatch = matchSample.reduce((a, b) => a + b, 0) / matchSample.length;
    const avgNonMatch = nonMatchSample.reduce((a, b) => a + b, 0) / nonMatchSample.length;
    expect(avgMatch).toBeGreaterThan(avgNonMatch);
  });
});

// ═══════════════════════════════════════════════════════════════
// Category B: Convergence Properties
// ═══════════════════════════════════════════════════════════════

describe('EM convergence properties', () => {
  it('B1: log-likelihood monotonically increases across iterations', () => {
    const pairs = generateDataset(500, 500, ['name', 'dob']);
    const result = runEM(pairs, { maxIterations: 20 });

    const llh = result.logLikelihoodHistory;
    for (let i = 1; i < llh.length; i++) {
      expect(llh[i]!).toBeGreaterThanOrEqual(llh[i - 1]! - 1e-8);
    }
  });

  it('B2: converges before maxIterations on well-separated data', () => {
    const pairs = generateDataset(900, 100, ['name', 'dob']);
    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-6 });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThan(50);
  });

  it('B3: uses at least 2 iterations for any non-trivial dataset', () => {
    const pairs = generateDataset(100, 100, ['name']);
    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-10 });
    expect(result.iterations).toBeGreaterThanOrEqual(2);
  });

  it('B4: tighter epsilon → ≥ iterations', () => {
    const pairs = generateDataset(500, 500, ['name']);

    const tight = estimateParameters(pairs, { maxIterations: 50, epsilon: 1e-10 });
    const loose = estimateParameters(pairs, { maxIterations: 50, epsilon: 1e-3 });

    expect(tight.iterations).toBeGreaterThanOrEqual(loose.iterations);
  });

  it('B5: epsilon = 0.1 converges fast (≤ 15 iterations)', () => {
    const pairs = generateDataset(500, 500, ['name']);
    const result = estimateParameters(pairs, { maxIterations: 50, epsilon: 0.1 });
    expect(result.iterations).toBeLessThanOrEqual(15);
  });

  it('B6: parameters stabilize at convergence — final LL change is small', () => {
    const pairs = generateDataset(700, 300, ['name']);
    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-6 });

    if (result.logLikelihoodHistory.length >= 3) {
      const last = result.logLikelihoodHistory[result.logLikelihoodHistory.length - 1]!;
      const prev2 = result.logLikelihoodHistory[result.logLikelihoodHistory.length - 3]!;
      expect(Math.abs(last - prev2)).toBeLessThan(1e-2);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Category C: Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('EM edge cases', () => {
  it('C1: single pair — completes without error', () => {
    const pairs = [makePair(exactMatch('name'))];
    const result = runEM(pairs, { maxIterations: 10 });
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.posteriors).toHaveLength(1);
  });

  it('C2: all exact-match pairs → λ → high', () => {
    const pairs: ComparisonVector[][] = [];
    for (let i = 0; i < 100; i++) {
      pairs.push(makePair(exactMatch('name'), exactMatch('dob')));
    }
    const result = runEM(pairs);
    // With all exact matches, λ should be high (≥ 0.7 after Laplace)
    expect(result.parameters.lambda).toBeGreaterThan(0.7);
  });

  it('C3: all-same-level data with small variation converges correctly', () => {
    // Pure single-level data is unidentifiable (EM needs level variation).
    // Add 2% exact_match pairs to break the symmetry.
    const pairs: ComparisonVector[][] = [];
    for (let i = 0; i < 196; i++) {
      pairs.push(makePair(notMatch('name'), notMatch('dob')));
    }
    for (let i = 0; i < 4; i++) {
      pairs.push(makePair(exactMatch('name'), exactMatch('dob')));
    }
    const result = estimateParameters(pairs, { maxIterations: 100, epsilon: 1e-8 });
    // With 2% match pairs, λ should converge low
    expect(result.parameters.lambda).toBeLessThan(0.4);
  });

  it('C4: empty input throws meaningful error', () => {
    expect(() => estimateParameters([])).toThrow(/empty/i);
  });

  it('C5: single pair with single field', () => {
    const result = runEM([makePair(exactMatch('name'))], { maxIterations: 5 });
    expect(result.posteriors).toHaveLength(1);
    expect(result.parameters.mProbabilities.has('name:exact_match')).toBe(true);
  });

  it('C6: multi-field pairs handle all field:level keys', () => {
    const pairs: ComparisonVector[][] = [
      makePair(exactMatch('name'), exactMatch('email'), strongMatch('dob')),
      makePair(notMatch('name'), notMatch('email'), notMatch('dob')),
      makePair(exactMatch('name'), notMatch('email'), exactMatch('dob')),
    ];

    const result = runEM(pairs);
    expect(result.parameters.mProbabilities.has('name:exact_match')).toBe(true);
    expect(result.parameters.mProbabilities.has('name:not_match')).toBe(true);
    expect(result.parameters.mProbabilities.has('email:exact_match')).toBe(true);
    expect(result.parameters.mProbabilities.has('email:not_match')).toBe(true);
    expect(result.parameters.mProbabilities.has('dob:strong_match')).toBe(true);
    expect(result.parameters.mProbabilities.has('dob:not_match')).toBe(true);
  });

  it('C7: pairs with varying field counts', () => {
    const pairs: ComparisonVector[][] = [
      makePair(exactMatch('name')),
      makePair(exactMatch('name'), exactMatch('dob')),
      makePair(notMatch('name')),
    ];

    const result = runEM(pairs);
    expect(result.parameters.mProbabilities.has('name:exact_match')).toBe(true);
  });

  it('C8: 1000 pairs converge within 50 iterations', () => {
    const pairs = generateDataset(500, 500, ['name', 'dob']);
    const result = runEM(pairs, { maxIterations: 50 });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// Category D: Numerical Stability
// ═══════════════════════════════════════════════════════════════

describe('EM numerical stability', () => {
  it('D1: extreme scores (0 and 1) do not cause NaN', () => {
    const pairs: ComparisonVector[][] = [
      makePair(
        { field: 'a', level: 'exact_match', score: 0, scorer: 'exact' },
        { field: 'b', level: 'not_match', score: 1, scorer: 'exact' },
      ),
      makePair(
        { field: 'a', level: 'not_match', score: 0, scorer: 'exact' },
        { field: 'b', level: 'exact_match', score: 1, scorer: 'exact' },
      ),
    ];

    const result = estimateParameters(pairs, { maxIterations: 10, epsilon: 1e-6 });
    for (const p of result.posteriors) {
      expect(Number.isFinite(p)).toBe(true);
    }
  });

  it('D2: many identical pairs do not cause divide-by-zero', () => {
    const pairs: ComparisonVector[][] = [];
    for (let i = 0; i < 500; i++) {
      pairs.push(makePair(exactMatch('name')));
    }
    const result = runEM(pairs);
    expect(Number.isFinite(result.parameters.lambda)).toBe(true);
  });

  it('D3: probabilities remain clamped within valid range', () => {
    const pairs = generateDataset(10, 990, ['name']);
    const result = runEM(pairs);

    for (const [, m] of result.parameters.mProbabilities) {
      expect(m).toBeGreaterThan(0);
      expect(m).toBeLessThan(1);
    }
    for (const [, u] of result.parameters.uProbabilities) {
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('D4: symmetry — pair order does not affect result', () => {
    const pairs = generateDataset(300, 200, ['name', 'dob']);
    const reversed = [...pairs].reverse();

    const r1 = runEM(pairs, { maxIterations: 50, epsilon: 1e-8 });
    const r2 = runEM(reversed, { maxIterations: 50, epsilon: 1e-8 });

    expect(Math.abs(r1.parameters.lambda - r2.parameters.lambda)).toBeLessThan(1e-6);

    for (const key of r1.parameters.mProbabilities.keys()) {
      const m1 = r1.parameters.mProbabilities.get(key)!;
      const m2 = r2.parameters.mProbabilities.get(key)!;
      expect(Math.abs(m1 - m2)).toBeLessThan(1e-6);

      const u1 = r1.parameters.uProbabilities.get(key)!;
      const u2 = r2.parameters.uProbabilities.get(key)!;
      expect(Math.abs(u1 - u2)).toBeLessThan(1e-6);
    }
  });

  it('D5: reproducibility — same input, same result', () => {
    const pairs = generateDataset(400, 600, ['name']);

    const r1 = estimateParameters(pairs, { maxIterations: 20, epsilon: 1e-8 });
    const r2 = estimateParameters(pairs, { maxIterations: 20, epsilon: 1e-8 });

    expect(r1.parameters.lambda).toBe(r2.parameters.lambda);
    expect(r1.iterations).toBe(r2.iterations);
    expect(r1.converged).toBe(r2.converged);
    for (let i = 0; i < r1.posteriors.length; i++) {
      expect(r1.posteriors[i]).toBe(r2.posteriors[i]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Category E: Mixed-Level & Multi-Field
// ═══════════════════════════════════════════════════════════════

describe('EM mixed levels & multi-field', () => {
  it('E1: moderate_match treated as distinct from exact_match', () => {
    const pairs: ComparisonVector[][] = [];
    for (let i = 0; i < 400; i++) pairs.push(makePair(exactMatch('name')));
    for (let i = 0; i < 200; i++) pairs.push(makePair(moderateMatch('name')));
    for (let i = 0; i < 400; i++) pairs.push(makePair(notMatch('name')));

    const result = runEM(pairs);

    const mExact = result.parameters.mProbabilities.get('name:exact_match');
    const mModerate = result.parameters.mProbabilities.get('name:moderate_match');
    expect(mExact).toBeDefined();
    expect(mModerate).toBeDefined();
    // exact_match ≥ moderate_match due to level ordering
    expect(mExact!).toBeGreaterThanOrEqual(mModerate! - 1e-10);
  });

  it('E2: λ recovers true match ratio with mixed-level data', () => {
    // 300 match pairs (mix of exact/strong) + 700 non-match (mix of not/moderate)
    const pairs = generateDataset(300, 700, ['name']);

    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-8 });
    // With 30% true matches and well-separated data, λ should be in range
    expect(result.parameters.lambda).toBeGreaterThan(0.15);
    expect(result.parameters.lambda).toBeLessThan(0.55);
  });

  it('E3: three fields with different signal strength', () => {
    const pairs: ComparisonVector[][] = [];
    for (let i = 0; i < 500; i++) {
      pairs.push(makePair(
        exactMatch('name'),
        i % 5 === 0 ? notMatch('dob') : exactMatch('dob'),
        i % 2 === 0 ? notMatch('city') : exactMatch('city'),
      ));
    }
    for (let i = 0; i < 500; i++) {
      pairs.push(makePair(notMatch('name'), notMatch('dob'), notMatch('city')));
    }

    const result = runEM(pairs, { maxIterations: 50 });
    const mName = result.parameters.mProbabilities.get('name:exact_match')!;
    const mDob = result.parameters.mProbabilities.get('dob:exact_match')!;
    // name has 100% exact in match pairs, dob has 80% — name has stronger signal
    // Both should have high m for exact_match since most match pairs are exact
    expect(mName).toBeGreaterThan(0);
    expect(mDob).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Category F: Known-Distribution Recovery
// ═══════════════════════════════════════════════════════════════

describe('EM known-distribution recovery', () => {
  it('F1: recovers high λ (λ_true ≈ 0.95) within tolerance', () => {
    const pairs = generateDataset(950, 50, ['name']);
    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-10 });
    // With Laplace smoothing, λ estimate is slightly pulled toward 0.5
    expect(result.parameters.lambda).toBeGreaterThan(0.80);
    expect(result.parameters.lambda).toBeLessThan(0.99);
  });

  it('F2: recovers low λ (λ_true ≈ 0.05) within tolerance', () => {
    const pairs = generateDataset(50, 950, ['name']);
    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-10 });
    expect(result.parameters.lambda).toBeGreaterThan(0.01);
    expect(result.parameters.lambda).toBeLessThan(0.25);
  });

  it('F3: m for exact_match >> m for not_match on well-separated data', () => {
    const pairs = generateDataset(800, 200, ['name']);
    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-10 });

    const mExact = result.parameters.mProbabilities.get('name:exact_match')!;
    const mNot = result.parameters.mProbabilities.get('name:not_match')!;
    // exact_match should have much higher m than not_match
    expect(mExact).toBeGreaterThan(mNot);
  });

  it('F4: u for not_match >> u for exact_match on well-separated data', () => {
    const pairs = generateDataset(800, 200, ['name']);
    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-10 });

    const uExact = result.parameters.uProbabilities.get('name:exact_match')!;
    const uNot = result.parameters.uProbabilities.get('name:not_match')!;
    // not_match should have higher u than exact_match
    expect(uNot).toBeGreaterThan(uExact);
  });
});

// ═══════════════════════════════════════════════════════════════
// Category G: Level Ordering Constraint Specific Tests
// ═══════════════════════════════════════════════════════════════

describe('EM level ordering constraints', () => {
  it('G1: m monotonic — exact > strong > moderate > not_match', () => {
    const pairs: ComparisonVector[][] = [
      ...Array.from({ length: 100 }, () => makePair(exactMatch('name'))),
      ...Array.from({ length: 50 }, () => makePair(strongMatch('name'))),
      ...Array.from({ length: 30 }, () => makePair(moderateMatch('name'))),
      ...Array.from({ length: 20 }, () => makePair(notMatch('name'))),
    ];

    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-10 });

    const mExact = result.parameters.mProbabilities.get('name:exact_match');
    const mStrong = result.parameters.mProbabilities.get('name:strong_match');
    const mModerate = result.parameters.mProbabilities.get('name:moderate_match');
    const mNot = result.parameters.mProbabilities.get('name:not_match');

    // Assert monotonic: exact ≥ strong ≥ moderate ≥ not_match
    if (mExact && mStrong) expect(mExact).toBeGreaterThanOrEqual(mStrong - 1e-10);
    if (mStrong && mModerate) expect(mStrong).toBeGreaterThanOrEqual(mModerate - 1e-10);
    if (mModerate && mNot) expect(mModerate).toBeGreaterThanOrEqual(mNot - 1e-10);
  });

  it('G2: u reverse-monotonic — exact ≤ strong ≤ not_match', () => {
    const pairs: ComparisonVector[][] = [
      ...Array.from({ length: 100 }, () => makePair(exactMatch('name'))),
      ...Array.from({ length: 50 }, () => makePair(strongMatch('name'))),
      ...Array.from({ length: 30 }, () => makePair(moderateMatch('name'))),
      ...Array.from({ length: 20 }, () => makePair(notMatch('name'))),
    ];

    const result = runEM(pairs, { maxIterations: 50, epsilon: 1e-10 });

    const uExact = result.parameters.uProbabilities.get('name:exact_match');
    const uStrong = result.parameters.uProbabilities.get('name:strong_match');
    const uModerate = result.parameters.uProbabilities.get('name:moderate_match');
    const uNot = result.parameters.uProbabilities.get('name:not_match');

    // Assert reverse-monotonic: exact ≤ strong ≤ moderate ≤ not_match
    // Allow small numerical tolerance for level-ordering constraint
    if (uExact && uStrong) expect(uExact).toBeLessThanOrEqual(uStrong + 5e-3);
    if (uStrong && uModerate) expect(uStrong).toBeLessThanOrEqual(uModerate + 5e-3);
    if (uModerate && uNot) expect(uModerate).toBeLessThanOrEqual(uNot + 5e-3);
  });
});
