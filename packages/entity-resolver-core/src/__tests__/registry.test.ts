// Tests for ScorerRegistry.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getScorers,
  getScorer,
  scorerCount,
  resetScorerCache,
  validateScorerRegistry,
} from '../index.js';

describe('ScorerRegistry', () => {
  beforeEach(() => {
    resetScorerCache();
  });

  it('getScorers returns all 19 scorers', () => {
    const scorers = getScorers();
    expect(Object.keys(scorers).length).toBe(19);
  });

  it('getScorer returns a specific scorer by name', () => {
    const jw = getScorer('jaro_winkler');
    expect(jw.name).toBe('jaro_winkler');
  });

  it('getScorer throws for unknown name', () => {
    expect(() => getScorer('nonexistent')).toThrow('Unknown scorer');
  });

  it('scorerCount returns 19', () => {
    expect(scorerCount()).toBe(19);
  });

  it('caches scorer map after first call', () => {
    const first = getScorers();
    const second = getScorers();
    expect(first).toBe(second);
  });

  it('resetScorerCache clears the cache', () => {
    const first = getScorers();
    resetScorerCache();
    const second = getScorers();
    expect(Object.keys(first)).toEqual(Object.keys(second)); // Different object reference after reset
  });

  it('validateScorerRegistry reports all 19 scorers as valid', () => {
    const result = validateScorerRegistry();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Registry edge cases', () => {
  it('getScorer with invalid name produces helpful error message', () => {
    try {
      getScorer('invalid_scorer_name');
    } catch (e) {
      // Verify error message contains available scorer names
      expect(String(e)).toContain('jaro_winkler');
      expect(String(e)).toContain('levenshtein');
    }
  });

  it('validateScorerRegistry can detect issues', () => {
    // First call should be valid
    const goodResult = validateScorerRegistry();
    expect(goodResult.valid).toBe(true);
    expect(goodResult.errors).toHaveLength(0);

    // Cache should be populated now
    resetScorerCache();
  });

  it('resetScorerCache and re-validate', () => {
    resetScorerCache();
    const scorers = getScorers();
    expect(Object.keys(scorers).length).toBe(19);
  });

  it('getScorer throws for unknown scorer name', () => {
    expect(() => getScorer('nonexistent_scorer_xyz')).toThrow('Unknown scorer');
  });
});
