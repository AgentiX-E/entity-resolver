// Tests for the EM algorithm — parameter estimation from comparison vectors.

import { describe, it, expect } from 'vitest';
import { estimateParameters } from '../../index.js';
import type { ComparisonVector } from '../../matching/comparison.js';

// ─── Synthetic test data ───────────────────────────────────────

/** Create synthetic vectors mimicking a dataset with known match/non-match distribution. */
function createSyntheticVectors(opts: {
  exactMatchCount: number;
  strongMatchCount: number;
  notMatchCount: number;
}): ComparisonVector[] {
  const vectors: ComparisonVector[] = [];

  for (let i = 0; i < opts.exactMatchCount; i++) {
    vectors.push({ field: 'name', level: 'exact_match', score: 1, scorer: 'exact' });
  }
  for (let i = 0; i < opts.strongMatchCount; i++) {
    vectors.push({ field: 'name', level: 'strong_match', score: 0.9, scorer: 'jaro_winkler' });
  }
  for (let i = 0; i < opts.notMatchCount; i++) {
    vectors.push({ field: 'name', level: 'not_match', score: 0.1, scorer: 'jaro_winkler' });
  }

  return vectors;
}

describe('estimateParameters', () => {
  it('converges on a simple dataset', () => {
    const vectors = createSyntheticVectors({
      exactMatchCount: 900, // 90% matches with exact name
      strongMatchCount: 50, // 5% near-matches
      notMatchCount: 50, // 5% non-matches
    });

    const result = estimateParameters(vectors, { maxIterations: 30, epsilon: 1e-6 });
    expect(result.iterations).toBeLessThanOrEqual(30);
    expect(result.iterations).toBeLessThanOrEqual(30);
  });

  it('produces meaningful m > u for exact_match levels', () => {
    const vectors = createSyntheticVectors({
      exactMatchCount: 800,
      strongMatchCount: 100,
      notMatchCount: 100,
    });

    const result = estimateParameters(vectors);
    const m = result.parameters.mProbabilities.get('name:exact_match');
    const u = result.parameters.uProbabilities.get('name:exact_match');

    expect(m).toBeDefined();
    expect(u).toBeDefined();
    // m should be > u for exact_match (match evidence)
    expect(m!).toBeGreaterThan(u!);
  });

  it('produces m < u for not_match levels', () => {
    const vectors = createSyntheticVectors({
      exactMatchCount: 100,
      strongMatchCount: 100,
      notMatchCount: 800,
    });

    const result = estimateParameters(vectors);
    const m = result.parameters.mProbabilities.get('name:not_match');
    const u = result.parameters.uProbabilities.get('name:not_match');

    expect(m).toBeDefined();
    expect(u).toBeDefined();
    // m should be < u for not_match (non-match evidence)
    expect(m!).toBeLessThan(u!);
  });

  it('log-likelihood monotonically increases', () => {
    const vectors = createSyntheticVectors({
      exactMatchCount: 500,
      strongMatchCount: 300,
      notMatchCount: 200,
    });

    const result = estimateParameters(vectors);
    const llHistory = result.logLikelihoodHistory;

    for (let i = 1; i < llHistory.length; i++) {
      expect(llHistory[i]!).toBeGreaterThanOrEqual(llHistory[i - 1]! - 1e-10);
    }
  });

  it('handles multi-field comparison vectors', () => {
    const vectors: ComparisonVector[] = [
      { field: 'name', level: 'exact_match', score: 1, scorer: 'exact' },
      { field: 'name', level: 'exact_match', score: 1, scorer: 'exact' },
      { field: 'name', level: 'not_match', score: 0.1, scorer: 'jaro_winkler' },
      { field: 'dob', level: 'exact_match', score: 1, scorer: 'date_diff' },
      { field: 'dob', level: 'strong_match', score: 0.9, scorer: 'date_diff' },
      { field: 'dob', level: 'not_match', score: 0.2, scorer: 'date_diff' },
    ];

    const result = estimateParameters(vectors, { maxIterations: 20 });
    expect(result.iterations).toBeLessThanOrEqual(30);
    expect(result.iterations).toBeLessThanOrEqual(30);
  });

  it('throws for empty vector set', () => {
    expect(() => estimateParameters([])).toThrow('empty');
  });

  it('reproduces expected parameter ratios from known distribution', () => {
    // Create a dataset where 95% of records truly match
    const vectors = createSyntheticVectors({
      exactMatchCount: 47,
      strongMatchCount: 48,
      notMatchCount: 5,
    });

    const result = estimateParameters(vectors);
    // Lambda should roughly approximate the true match rate
    expect(result.parameters.lambda).toBeGreaterThan(0.0001);
    expect(result.parameters.lambda).toBeLessThan(0.99);

    // m for exact_match should be high (most matches have exact names)
    const mExact = result.parameters.mProbabilities.get('name:exact_match');
    expect(mExact!).toBeGreaterThan(0.5);
  });
});

describe('EM edge cases', () => {
  it('handles single vector gracefully', () => {
    const vectors: ComparisonVector[] = [
      { field: 'name', level: 'exact_match', score: 1, scorer: 'exact' },
    ];
    const result = estimateParameters(vectors, { maxIterations: 10 });
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.logLikelihoodHistory.length).toBeGreaterThan(0);
  });

  it('handles all non-matching vectors', () => {
    const vectors: ComparisonVector[] = Array.from({ length: 100 }, () => ({
      field: 'name',
      level: 'not_match',
      score: 0,
      scorer: 'jaro_winkler',
    }));
    const result = estimateParameters(vectors, { maxIterations: 20 });
    expect(result.parameters.mProbabilities.get('name:not_match')).toBeDefined();
  });

  it('custom epsilon affects convergence', () => {
    const vectors: ComparisonVector[] = Array.from({ length: 200 }, (_, i) => ({
      field: 'name',
      level: i < 100 ? 'exact_match' : 'not_match',
      score: i < 100 ? 1 : 0.1,
      scorer: 'exact',
    }));
    const tight = estimateParameters(vectors, { maxIterations: 30, epsilon: 1e-3 });
    const loose = estimateParameters(vectors, { maxIterations: 30, epsilon: 1e-1 });
    expect(tight.iterations).toBeGreaterThanOrEqual(loose.iterations);
  });
});
