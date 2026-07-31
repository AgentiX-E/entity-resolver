// Tests for resolveSqlScorerFn — DuckDB scorer function name mapping.
// These are pure unit tests that do not require a DuckDB backend.
import { describe, it, expect } from 'vitest';
import { resolveSqlScorerFn } from '../../index.js';

describe('resolveSqlScorerFn', () => {
  // ── Known scorer mappings ──
  it('maps jaro_winkler to jaro_winkler_similarity', () => {
    expect(resolveSqlScorerFn('jaro_winkler')).toBe('jaro_winkler_similarity');
  });

  it('maps jaro to jaro_similarity', () => {
    expect(resolveSqlScorerFn('jaro')).toBe('jaro_similarity');
  });

  it('maps levenshtein to levenshtein', () => {
    expect(resolveSqlScorerFn('levenshtein')).toBe('levenshtein');
  });

  it('maps damerau_levenshtein to damerau_levenshtein', () => {
    expect(resolveSqlScorerFn('damerau_levenshtein')).toBe('damerau_levenshtein');
  });

  it('maps exact to exact_match', () => {
    expect(resolveSqlScorerFn('exact')).toBe('exact_match');
  });

  it('maps jaccard to jaccard', () => {
    expect(resolveSqlScorerFn('jaccard')).toBe('jaccard');
  });

  it('maps dice to dice_coefficient', () => {
    expect(resolveSqlScorerFn('dice')).toBe('dice_coefficient');
  });

  it('maps hamming to hamming', () => {
    expect(resolveSqlScorerFn('hamming')).toBe('hamming');
  });

  // ── Scorers NOT supported in the SQL pipeline (must throw) ──
  it('throws for unsupported scorer soundex', () => {
    expect(() => resolveSqlScorerFn('soundex')).toThrow(
      'Scorer "soundex" is not supported in the SQL pipeline',
    );
  });

  it('throws for unsupported scorer token_sort', () => {
    expect(() => resolveSqlScorerFn('token_sort')).toThrow(
      'Scorer "token_sort" is not supported in the SQL pipeline',
    );
  });

  it('throws for unsupported scorer double_metaphone', () => {
    expect(() => resolveSqlScorerFn('double_metaphone')).toThrow(
      'Scorer "double_metaphone" is not supported in the SQL pipeline',
    );
  });

  it('throws for unsupported scorer tfidf_cosine', () => {
    expect(() => resolveSqlScorerFn('tfidf_cosine')).toThrow(
      'Scorer "tfidf_cosine" is not supported in the SQL pipeline',
    );
  });

  it('throws for unsupported scorer numeric_diff', () => {
    expect(() => resolveSqlScorerFn('numeric_diff')).toThrow(
      'Scorer "numeric_diff" is not supported in the SQL pipeline',
    );
  });

  it('throws for unsupported scorer date_diff', () => {
    expect(() => resolveSqlScorerFn('date_diff')).toThrow(/not supported in the SQL pipeline/);
  });

  it('throws for completely unknown scorer', () => {
    expect(() => resolveSqlScorerFn('nonexistent_scorer')).toThrow(
      'Scorer "nonexistent_scorer" is not supported in the SQL pipeline',
    );
  });

  // ── Error message quality ──
  it('error message lists all supported scorers', () => {
    try {
      resolveSqlScorerFn('unknown');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('jaro_winkler');
      expect(msg).toContain('jaro');
      expect(msg).toContain('levenshtein');
      expect(msg).toContain('damerau_levenshtein');
      expect(msg).toContain('exact');
      expect(msg).toContain('jaccard');
      expect(msg).toContain('dice');
      expect(msg).toContain('hamming');
    }
  });
});
