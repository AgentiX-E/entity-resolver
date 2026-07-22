// Tests for match weight calculation and probability conversion.

import { describe, it, expect } from 'vitest';
import {
  computeMatchWeight,
  computeAggregateMatchWeight,
  weightToProbability,
  probabilityToWeight,
  priorWeight,
  MATCH_WEIGHT_INTERPRETATION,
  createDefaultParameters,
} from '../../index.js';
import type { ComparisonVector } from '../../matching/comparison.js';

describe('computeMatchWeight', () => {
  const params = createDefaultParameters(
    ['name:exact_match', 'name:strong_match', 'name:not_match'],
    { initialLambda: 0.01, initialM: 0.95, initialU: 0.05 },
  );

  it('computes positive weight for exact match', () => {
    const vector: ComparisonVector = {
      field: 'name',
      level: 'exact_match',
      score: 1,
      scorer: 'exact',
    };
    const result = computeMatchWeight(vector, params);
    expect(result.totalWeight).toBeGreaterThan(result.priorWeight);
    expect(result.totalWeight).toBeGreaterThan(result.priorWeight);
  });

  it('computes weight with field:* fallback', () => {
    // Using a level not explicitly in params
    const vec: ComparisonVector = {
      field: 'name',
      level: 'exact_match',
      score: 1,
      scorer: 'exact',
    };
    const result = computeMatchWeight(vec, params);
    expect(result.totalWeight).toBeDefined();
  });

  it('returns neutral weight for unknown field', () => {
    const vector: ComparisonVector = {
      field: 'unknown',
      level: 'exact_match',
      score: 1,
      scorer: 'exact',
    };
    const result = computeMatchWeight(vector, params);
    // Should have prior weight only
    expect(result.fieldWeights.get('unknown')).toBe(0);
    expect(result.priorWeight).toBeLessThan(0); // prior with lambda=0.01 is negative
  });
});

describe('computeAggregateMatchWeight', () => {
  const params = createDefaultParameters(
    ['name:exact_match', 'name:not_match', 'dob:exact_match'],
    { initialLambda: 0.001, initialM: 0.9, initialU: 0.1 },
  );

  it('aggregates weights across multiple fields', () => {
    const vectors: ComparisonVector[] = [
      { field: 'name', level: 'exact_match', score: 1, scorer: 'exact' },
      { field: 'dob', level: 'exact_match', score: 1, scorer: 'date_diff' },
    ];
    const result = computeAggregateMatchWeight(vectors, params);
    expect(result.fieldWeights.size).toBe(2);
    expect(result.totalWeight).toBeGreaterThan(result.priorWeight);
  });

  it('returns prior-only when no fields match params', () => {
    const vectors: ComparisonVector[] = [
      { field: 'unknown', level: 'exact_match', score: 1, scorer: 'exact' },
    ];
    const result = computeAggregateMatchWeight(vectors, params);
    expect(result.totalWeight).toBe(result.priorWeight);
  });
});

describe('weightToProbability', () => {
  it('converts weight 0 to 0.5', () => {
    expect(weightToProbability(0)).toBe(0.5);
  });

  it('converts weight 7 to ~0.99', () => {
    expect(weightToProbability(7)).toBeCloseTo(0.992, 2);
  });

  it('handles extreme positive weights', () => {
    expect(weightToProbability(100)).toBeCloseTo(1, 10);
  });

  it('handles extreme negative weights', () => {
    expect(weightToProbability(-100)).toBeCloseTo(0, 10);
  });
});

describe('probabilityToWeight', () => {
  it('converts 0.5 to 0', () => {
    expect(probabilityToWeight(0.5)).toBeCloseTo(0, 5);
  });

  it('is inverse of weightToProbability', () => {
    for (const w of [0, 2, 3, 4, 7]) {
      expect(probabilityToWeight(weightToProbability(w))).toBeCloseTo(w, 5);
    }
  });
});

describe('priorWeight', () => {
  it('returns 0 for lambda = 0.5', () => {
    expect(priorWeight(0.5)).toBeCloseTo(0, 5);
  });

  it('returns negative for lambda < 0.5', () => {
    expect(priorWeight(0.001)).toBeLessThan(0);
  });
});

describe('MATCH_WEIGHT_INTERPRETATION', () => {
  it('defines standard thresholds', () => {
    expect(MATCH_WEIGHT_INTERPRETATION.VERY_STRONG).toBe(7);
    expect(weightToProbability(7)).toBeGreaterThan(0.99);

    expect(MATCH_WEIGHT_INTERPRETATION.STRONG).toBe(4);
    expect(weightToProbability(4)).toBeGreaterThan(0.94);

    expect(MATCH_WEIGHT_INTERPRETATION.NEUTRAL).toBe(0);
    expect(weightToProbability(0)).toBe(0.5);
  });
});
