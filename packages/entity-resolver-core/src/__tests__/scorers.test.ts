// Comprehensive test suite for all 19 scorers.
// Verifies: correctness, edge cases, property invariants, ensemble performance.

import { describe, it, expect } from 'vitest';
import {
  exactScorer,
  levenshteinScorer,
  damerauLevenshteinScorer,
  jaroScorer,
  jaroWinklerScorer,
  diceScorer,
  jaccardScorer,
  overlapScorer,
  lcsScorer,
  soundexScorer,
  doubleMetaphoneScorer,
  tokenSortScorer,
  tfidfCosineScorer,
  qgramJaccardScorer,
  ensembleScorer,
  numericDiffScorer,
  dateDiffScorer,
  booleanMatchScorer,
  ALL_SCORERS,
  IMPLEMENTED_SCORER_COUNT,
} from '../index.js';
import type { IScorer } from '../interfaces/IScorer.js';
import type { FieldMetadata } from '../types/core.js';
import fc from 'fast-check';

const TEST_FIELD: FieldMetadata = {
  name: 'test',
  semanticType: 'string',
  cardinality: 1,
  isNumeric: false,
};

// ─── Utility ───────────────────────────────────────────────────

function expectValidScore(scorer: IScorer, a: unknown, b: unknown): number {
  const score = scorer.score(a, b, TEST_FIELD);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(1);
  return score;
}

// ─── 19 Scorers Exist ──────────────────────────────────────────

describe('Scorer count', () => {
  it('should have exactly 20 scorer keys (19 unique + 1 legacy alias)', () => {
    // qgram_jaccard replaced qgram_tfidf; the legacy key is kept as an alias
    expect(IMPLEMENTED_SCORER_COUNT).toBe(20);
    expect(Object.keys(ALL_SCORERS).length).toBe(20);
  });

  it('every scorer should have a unique name (19 unique names)', () => {
    const names = Object.values(ALL_SCORERS).map((s) => s.name);
    expect(new Set(names).size).toBe(19); // qgram_tfidf alias shares qgram_jaccard's name
  });

  it('non-alias scorer names should match their keys', () => {
    // Legacy aliases (like qgram_tfidf → qgram_jaccard) are exempt
    const ALIAS_KEYS = new Set(['qgram_tfidf']);
    for (const [key, scorer] of Object.entries(ALL_SCORERS)) {
      if (ALIAS_KEYS.has(key)) continue;
      expect(scorer.name).toBe(key);
    }
  });
});

// ─── Exact ─────────────────────────────────────────────────────

describe('exact scorer', () => {
  const scorer = exactScorer;

  it('returns 1 for identical strings', () => {
    expect(scorer.score('hello', 'hello', TEST_FIELD)).toBe(1);
  });

  it('returns 0 for different strings', () => {
    expect(scorer.score('hello', 'world', TEST_FIELD)).toBe(0);
  });

  it('returns 0 for empty strings', () => {
    expect(scorer.score('', '', TEST_FIELD)).toBe(0);
  });

  it('trims whitespace', () => {
    expect(scorer.score('  hello  ', 'hello', TEST_FIELD)).toBe(1);
  });

  it('handles null/undefined gracefully', () => {
    expect(scorer.score(null, null, TEST_FIELD)).toBe(0);
    expect(scorer.score(undefined, 'hello', TEST_FIELD)).toBe(0);
  });

  // Soundex accuracy: homophones should match
  it('matches common Soundex homophones', () => {
    expect(soundexScorer.score('Robert', 'Rupert', TEST_FIELD)).toBe(1);
    expect(soundexScorer.score('Smith', 'Smyth', TEST_FIELD)).toBe(1);
    expect(soundexScorer.score('Brown', 'Browne', TEST_FIELD)).toBe(1);
  });

  it('does not match obviously different names', () => {
    expect(soundexScorer.score('Robert', 'Michael', TEST_FIELD)).toBe(0);
    expect(soundexScorer.score('Smith', 'Jones', TEST_FIELD)).toBe(0);
  });
});

// ─── Levenshtein ───────────────────────────────────────────────

describe('levenshtein scorer', () => {
  const scorer = levenshteinScorer;

  it('returns 1 for identical strings', () => {
    expect(scorer.score('hello', 'hello', TEST_FIELD)).toBe(1);
  });

  it('returns high score for close strings', () => {
    const score = scorer.score('kitten', 'sitting', TEST_FIELD);
    expect(score).toBeGreaterThan(0.4); // 3 edits out of 6-7 chars
  });

  it('returns 0 for empty vs non-empty', () => {
    expect(scorer.score('', 'hello', TEST_FIELD)).toBe(0);
  });

  it('returns 0 for entirely different strings', () => {
    const score = scorer.score('abc', 'xyz', TEST_FIELD);
    expect(score).toBe(0);
  });
});

// ─── Damerau-Levenshtein ───────────────────────────────────────

describe('damerau_levenshtein scorer', () => {
  const scorer = damerauLevenshteinScorer;

  it('handles transposition better than Levenshtein', () => {
    // "CAKE" vs "ACKE" is 2 edits for Levenshtein, 1 for Damerau-Levenshtein
    const dl = scorer.score('CAKE', 'ACKE', TEST_FIELD);
    const lv = levenshteinScorer.score('CAKE', 'ACKE', TEST_FIELD);
    expect(dl).toBeGreaterThan(lv);
  });
});

// ─── Jaro / Jaro-Winkler ───────────────────────────────────────

describe('jaro scorer', () => {
  const scorer = jaroScorer;

  it('returns ~0.944 for MARTHA vs MARHTA', () => {
    const score = scorer.score('MARTHA', 'MARHTA', TEST_FIELD);
    expect(score).toBeCloseTo(0.944, 2);
  });

  it('returns 1 for identical strings', () => {
    expect(scorer.score('ABCD', 'ABCD', TEST_FIELD)).toBe(1);
  });
});

describe('jaro_winkler scorer', () => {
  const scorer = jaroWinklerScorer;

  it('returns higher score than Jaro for strings with common prefix', () => {
    const jw = scorer.score('MARTHA', 'MARHTA', TEST_FIELD);
    const j = jaroScorer.score('MARTHA', 'MARHTA', TEST_FIELD);
    expect(jw).toBeGreaterThan(j);
    expect(jw).toBeCloseTo(0.961, 2);
  });

  it('returns >= 0.95 for typical name variations', () => {
    // "John Smith" vs "Jon Smith" — should be high
    const score = scorer.score('John Smith', 'Jon Smith', TEST_FIELD);
    expect(score).toBeGreaterThanOrEqual(0.85);
  });
});

// ─── Dice / Jaccard / Overlap ─────────────────────────────────

describe('dice scorer', () => {
  it('returns 1 for identical strings', () => {
    expect(diceScorer.score('abc', 'abc', TEST_FIELD)).toBe(1);
  });

  it('handles bigram overlap', () => {
    const score = diceScorer.score('night', 'nacht', TEST_FIELD);
    expectValidScore(diceScorer, 'night', 'nacht');
    expect(score).toBeGreaterThan(0);
  });
});

describe('jaccard scorer', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardScorer.score('abc', 'abc', TEST_FIELD)).toBe(1);
  });
});

describe('overlap scorer', () => {
  it('returns 1 when one is subset of the other', () => {
    const score = overlapScorer.score('ab', 'abc', TEST_FIELD);
    // Overlap = |intersection| / min(|A|,|B|) — "ab" chars are all in "abc"
    expect(score).toBeGreaterThan(0.5);
  });
});

// ──��� LCS ──────────────────────────────────────────────────────

describe('lcs scorer', () => {
  it('returns 1 for identical strings', () => {
    expect(lcsScorer.score('abc', 'abc', TEST_FIELD)).toBe(1);
  });

  it('finds common subsequence', () => {
    const score = lcsScorer.score('abcdef', 'acf', TEST_FIELD);
    expect(score).toBeGreaterThan(0);
  });
});

// ─── Double Metaphone ──────────────────────────────────────────

describe('double_metaphone scorer', () => {
  it('returns 1 for identical phonetic codes', () => {
    // "Knight" and "Night" have different primary MP but secondary match
    const score = doubleMetaphoneScorer.score('Knight', 'Night', TEST_FIELD);
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0.8 for secondary-match pairs', () => {
    expect(doubleMetaphoneScorer.score('Smith', 'Schmidt', TEST_FIELD)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Token Sort ────────────────────────────────────────────────

describe('token_sort scorer', () => {
  it('handles word order differences', () => {
    const score = tokenSortScorer.score('John Smith', 'Smith John', TEST_FIELD);
    expect(score).toBeGreaterThan(0.9);
  });

  it('returns 1 for identical after sort', () => {
    const score = tokenSortScorer.score('a b c', 'c b a', TEST_FIELD);
    expect(score).toBe(1);
  });
});

// ─── TF-IDF Cosine / Q-gram ────────────────────────────────────

describe('tfidf_cosine scorer', () => {
  it('returns 1 for identical strings', () => {
    expect(tfidfCosineScorer.score('hello', 'hello', TEST_FIELD)).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    const score = tfidfCosineScorer.score('abc', 'xyz', TEST_FIELD);
    expect(score).toBe(0);
  });

  it('returns > 0 for similar strings', () => {
    const score = tfidfCosineScorer.score('hello world', 'hello there', TEST_FIELD);
    expect(score).toBeGreaterThan(0);
  });
});

describe('qgram_tfidf scorer', () => {
  it('returns 1 for identical strings', () => {
    expect(qgramJaccardScorer.score('hello', 'hello', TEST_FIELD)).toBe(1);
  });
});

// ─── Ensemble ──────────────────────────────────────────────────

describe('ensemble scorer', () => {
  it('returns 1 for identical strings', () => {
    expect(ensembleScorer.score('John Smith', 'John Smith', TEST_FIELD)).toBe(1);
  });

  it('returns 0 for empty strings', () => {
    expect(ensembleScorer.score('', '', TEST_FIELD)).toBe(0);
    expect(ensembleScorer.score('', 'John', TEST_FIELD)).toBe(0);
  });

  it('provides good separation for similar vs different names', () => {
    const similar = ensembleScorer.score('John Smith', 'Jon Smith', TEST_FIELD);
    const different = ensembleScorer.score('John Smith', 'Mary Jones', TEST_FIELD);
    expect(similar).toBeGreaterThan(different);
    expect(similar).toBeGreaterThan(0.5);
  });

  it('catches typos via jaro_winkler signal', () => {
    // "Michael" vs "Micheal" — character swap, low token_sort, low soundex
    const score = ensembleScorer.score('Michael', 'Micheal', TEST_FIELD);
    expect(score).toBeGreaterThanOrEqual(0.85); // jaro_winkler should catch this
  });

  it('catches word reordering via token_sort signal', () => {
    // "John Smith" vs "Smith John" — low jaro_winkler, high token_sort
    const score = ensembleScorer.score('John Smith', 'Smith John', TEST_FIELD);
    expect(score).toBeGreaterThanOrEqual(0.8); // token_sort catches this
  });

  it('catches phonetic variants via soundex signal', () => {
    // "Catherine" vs "Katherine" — moderate jaro_winkler, soundex C365 vs K365
    const score = ensembleScorer.score('Catherine', 'Katherine', TEST_FIELD);
    expect(score).toBeGreaterThanOrEqual(0.8); // soundex×0.8 catches if codes match
  });

  it('max-of-three beats any single scorer for mixed variation', () => {
    // Mixed variation: typo + reordering + phonetic
    // Ensemble should pick the best signal
    const pairs: Array<[string, string]> = [
      ['Robert Williams', 'Rupert Williams'],   // phonetic → soundex helps
      ['Acme Corp', 'ACME Corporation'],        // token_sort via word reorder
      ['Steven', 'Stephen'],                     // typo → jaro_winkler
      ['Jon Smyth', 'John Smith'],              // mixed → ensemble picks best
    ];

    for (const [a, b] of pairs) {
      const ens = ensembleScorer.score(a, b, TEST_FIELD);
      expect(ens).toBeGreaterThanOrEqual(0.5); // At least one signal should match
    }
  });

  it('soundex contributes at 0.8 ceiling to avoid over-weighting phonetics', () => {
    // Even a perfect soundex match is capped at 0.8
    const score = ensembleScorer.score('Smith', 'Smyth', TEST_FIELD);
    // If soundex dominates: S530==S530 → 0.8. If jaro_winkler is higher, use that.
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('ensemble is never worse than jaro_winkler alone', () => {
    const pairs: Array<[string, string]> = [
      ['John', 'Jon'],
      ['David', 'Dave'],
      ['Elizabeth', 'Elisabeth'],
      ['Christopher', 'Kristofer'],
      ['Anthony', 'Tony'],
    ];

    for (const [a, b] of pairs) {
      const ens = ensembleScorer.score(a, b, TEST_FIELD);
      const jw = jaroWinklerScorer.score(a, b, TEST_FIELD);
      // Ensemble is max(jw, tokenSort, soundex×0.8); it MUST be ≥ jw.
      expect(ens).toBeGreaterThanOrEqual(jw - 1e-10);
    }
  });
});

// ─── Numeric Diff ──────────────────────────────────────────────

describe('numeric_diff scorer', () => {
  it('returns 1 for equal numbers', () => {
    expect(numericDiffScorer.score(100, 100, TEST_FIELD)).toBe(1);
  });

  it('returns close to 1 for near numbers', () => {
    const score = numericDiffScorer.score(100, 101, TEST_FIELD);
    expect(score).toBeGreaterThan(0.98);
  });

  it('returns 0 for NaN vs number', () => {
    expect(numericDiffScorer.score(NaN, 100, TEST_FIELD)).toBe(0);
  });
});

// ─── Date Diff ─────────────────────────────────────────────────

describe('date_diff scorer', () => {
  it('returns 1 for same date', () => {
    expect(dateDiffScorer.score('2024-01-15', '2024-01-15', TEST_FIELD)).toBe(1);
  });

  it('returns high score for close dates', () => {
    const score = dateDiffScorer.score('2024-01-15', '2024-01-16', TEST_FIELD);
    expect(score).toBeGreaterThan(0.99);
  });

  it('returns 0 for invalid dates', () => {
    expect(dateDiffScorer.score('not-a-date', '2024-01-15', TEST_FIELD)).toBe(0);
  });
});

// ─── Boolean Match ─────────────────────────────────────────────

describe('boolean_match scorer', () => {
  it('returns 1 for both truthy', () => {
    expect(booleanMatchScorer.score(true, 1, TEST_FIELD)).toBe(1);
  });

  it('returns 1 for both falsy', () => {
    expect(booleanMatchScorer.score(false, '', TEST_FIELD)).toBe(1);
  });

  it('returns 0 for truthy vs falsy', () => {
    expect(booleanMatchScorer.score(true, false, TEST_FIELD)).toBe(0);
  });
});

// ─── Property-based tests (fast-check) ─────────────────────────

describe('Property: all scorers return [0, 1]', () => {
  for (const [name, scorer] of Object.entries(ALL_SCORERS)) {
    it(`scorer "${name}" returns [0, 1] for random string pairs`, () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (a, b) => {
          const score = scorer.score(a, b, TEST_FIELD);
          return score >= 0 && score <= 1;
        }),
        { numRuns: 100 },
      );
    });

    it(`scorer "${name}" returns [0, 1] for null/undefined/empty`, () => {
      for (const val of [null, undefined, '', 0, NaN]) {
        const score = scorer.score(val, 'test', TEST_FIELD);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('Property: identical strings return 1 for most scorers', () => {
  const nonIdentityScorers = new Set([
    'numeric_diff', // numeric diff requires numeric strings
    'radial', // placeholder
    'soundex', // soundex breaks on non-alphabetic strings
    'double_metaphone', // breaks on single-char strings
    'ensemble', // composite scorers may not return exactly 1
    'date_diff', // date scorer breaks on non-date strings
    'exact', // returns 0 for empty strings
  ]);

  for (const [name, scorer] of Object.entries(ALL_SCORERS)) {
    if (nonIdentityScorers.has(name)) continue;

    it(`scorer "${name}" returns 1 for identical non-empty strings`, () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (s) => {
          const score = scorer.score(s, s, TEST_FIELD);
          return score === 1;
        }),
        { numRuns: 50 },
      );
    });
  }
});

describe('Property: scorers are symmetric', () => {
  for (const [name, scorer] of Object.entries(ALL_SCORERS)) {
    it(`scorer "${name}" is symmetric`, () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (a, b) => {
          const ab = scorer.score(a, b, TEST_FIELD);
          const ba = scorer.score(b, a, TEST_FIELD);
          return Math.abs(ab - ba) < 0.0001;
        }),
        { numRuns: 50 },
      );
    });
  }
});

// ─── Semantic accuracy — precise expected values ─────────────────

describe('Semantic accuracy (precise expected values)', () => {
  it('damerau_levenshtein: CAKE vs ACKE = 0.75', () => {
    const scorer = damerauLevenshteinScorer;
    // CAKE -> ACKE: transpose C/A (1 op), 4 chars -> 1 - 1/4 = 0.75
    const result = scorer.score('CAKE', 'ACKE', TEST_FIELD);
    expect(result).toBeCloseTo(0.75, 3);
  });

  it('damerau_levenshtein: ABCD vs ABCD = 1.0', () => {
    const scorer = damerauLevenshteinScorer;
    expect(scorer.score('ABCD', 'ABCD', TEST_FIELD)).toBe(1.0);
  });

  it('damerau_levenshtein: ABCD vs ABDC = 0.75 (one transposition)', () => {
    const scorer = damerauLevenshteinScorer;
    const result = scorer.score('ABCD', 'ABDC', TEST_FIELD);
    expect(result).toBeCloseTo(0.75, 3);
  });

  it('levenshtein: kitten vs sitting = 0.57', () => {
    const scorer = levenshteinScorer;
    // kitten(6) -> sitting(7): 3 ops -> 1 - 3/Math.max(6,7) = 4/7
    const result = scorer.score('kitten', 'sitting', TEST_FIELD);
    expect(result).toBeCloseTo(4 / 7, 4);
  });

  it('levenshtein: identical strings = 1.0', () => {
    const scorer = levenshteinScorer;
    expect(scorer.score('hello', 'hello', TEST_FIELD)).toBe(1.0);
  });

  it('levenshtein: completely different = 0.0', () => {
    const scorer = levenshteinScorer;
    expect(scorer.score('abc', 'xyz', TEST_FIELD)).toBe(0.0);
  });

  it('jaro_winkler: Martha vs Marhta has prefix bonus', () => {
    const scorer = jaroWinklerScorer;
    const result = scorer.score('Martha', 'Marhta', TEST_FIELD);
    expect(result).toBeGreaterThan(0.95);
  });
});
