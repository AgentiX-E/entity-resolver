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
    const params = createDefaultParameters(['name:exact_match', 'dob:strong_match']);
    expect(params.lambda).toBe(0.001);
    expect(params.mProbabilities.get('name:exact_match')).toBe(0.9);
    expect(params.uProbabilities.get('dob:strong_match')).toBe(0.1);
  });

  it('accepts custom initial values', () => {
    const params = createDefaultParameters(['test:*'], {
      initialLambda: 0.01,
      initialM: 0.8,
      initialU: 0.05,
    });
    expect(params.lambda).toBe(0.01);
    expect(params.mProbabilities.get('test:*')).toBe(0.8);
    expect(params.uProbabilities.get('test:*')).toBe(0.05);
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
    expect(frozen.mProbabilities.get('test:*')).toBe(0.9); // Frozen unchanged
  });
});
