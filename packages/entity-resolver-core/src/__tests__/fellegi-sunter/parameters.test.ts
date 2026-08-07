// Tests for FS parameters, validation, and factory functions.

import { describe, it, expect } from 'vitest';
import {
  createDefaultParameters,
  extractComparisonKeys,
  cloneParametersMutable,
  freezeParameters,
  validateParameters,
} from '../../index.js';
import type { ComparisonVector } from '../../matching/comparison.js';

describe('createDefaultParameters', () => {
  it('creates params with expected structure', () => {
    // Two levels on same field → exponential prior: higher k gets higher m
    const params = createDefaultParameters(['name:exact_match', 'name:strong_match']);
    expect(params.lambda).toBe(0.001);
    // P1: exponential priors replace uniform 0.9 — per-field 2^k distribution
    expect(params.mProbabilities.get('name:exact_match')).toBeCloseTo(0.333, 2);
    expect(params.mProbabilities.get('name:strong_match')).toBeCloseTo(0.667, 2);
    expect(params.uProbabilities.get('name:strong_match')).toBeCloseTo(0.1, 1);
  });

  it('accepts custom initial values', () => {
    const params = createDefaultParameters(['test:*'], {
      initialLambda: 0.01,
      initialM: 0.8,
      initialU: 0.05,
    });
    expect(params.lambda).toBe(0.01);
    // P1: initialM is ignored — exponential priors always used; single key → 1-ε
    expect(params.mProbabilities.get('test:*')).toBeCloseTo(1.0, 5);
    expect(params.uProbabilities.get('test:*')).toBeCloseTo(0.05, 1);
  });
});

describe('extractComparisonKeys', () => {
  it('extracts unique keys from vectors', () => {
    const vectors: ComparisonVector[] = [
      { field: 'name', level: 'exact_match', score: 1, scorer: 'exact' },
      { field: 'name', level: 'strong_match', score: 0.9, scorer: 'jaro_winkler' },
      { field: 'dob', level: 'exact_match', score: 1, scorer: 'date_diff' },
    ];
    const keys = extractComparisonKeys(vectors);
    expect(keys).toContain('name:exact_match');
    expect(keys).toContain('name:strong_match');
    expect(keys).toContain('dob:exact_match');
    expect(keys).toContain('name:*');
    expect(keys).toContain('dob:*');
  });
});

describe('validateParameters', () => {
  it('accepts valid parameters', () => {
    const params = createDefaultParameters(['test:*']);
    expect(() => {
      validateParameters(params);
    }).not.toThrow();
  });

  it('throws for lambda outside (0, 1)', () => {
    expect(() => {
      validateParameters({ lambda: 0, mProbabilities: new Map(), uProbabilities: new Map() });
    }).toThrow('lambda');
    expect(() => {
      validateParameters({ lambda: 1, mProbabilities: new Map(), uProbabilities: new Map() });
    }).toThrow('lambda');
  });

  it('throws for m-probability outside [0, 1]', () => {
    expect(() => {
      validateParameters({
        lambda: 0.1,
        mProbabilities: new Map([['test:*', 1.5]]),
        uProbabilities: new Map([['test:*', 0.1]]),
      });
    }).toThrow('m-probability');
  });

  it('throws for u-probability outside [0, 1]', () => {
    expect(() => {
      validateParameters({
        lambda: 0.1,
        mProbabilities: new Map([['test:*', 0.5]]),
        uProbabilities: new Map([['test:*', -0.1]]),
      });
    }).toThrow('u-probability');
  });
});

describe('cloneParametersMutable', () => {
  it('creates independent mutable copy', () => {
    const params = createDefaultParameters(['test:*']);
    const mutable = cloneParametersMutable(params);
    expect(mutable.lambda).toBe(params.lambda);
    mutable.lambda = 0.5;
    expect(params.lambda).toBe(0.001); // Original unchanged
  });
});

describe('freezeParameters', () => {
  it('creates new maps from mutable state', () => {
    const mutable = cloneParametersMutable(createDefaultParameters(['test:*']));
    const frozen = freezeParameters(mutable);
    mutable.mProbabilities.set('test:*', 0.5);
    // P1: single-key exponential prior → m ≈ 1.0, frozen copy unchanged
    expect(frozen.mProbabilities.get('test:*')).toBeCloseTo(1.0, 5); // Frozen unchanged
  });
});
