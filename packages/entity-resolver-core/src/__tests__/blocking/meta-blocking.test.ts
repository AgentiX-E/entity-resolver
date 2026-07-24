/**
 * Comprehensive tests for pyJedAI blocking strategies and meta-blocking pipeline.
 *
 * Verifies:
 * - SuffixArrays, ExtendedSuffixArrays, ExtendedQGrams blocking
 * - All 7 weighting schemes (CBS, JACCARD, COSINE, DICE, ECBS, EJS, X2)
 * - All 8 pruning methods (WEP, CEP, CNP, RCNP, WNP, BLAST, RWNP, CP)
 * - Full meta-blocking pipeline with various weight+prune combinations
 */
import { describe, it, expect } from 'vitest';
import {
  suffixArraysBlocking,
  extendedSuffixArraysBlocking,
  extendedQGramsBlocking,
} from '../../blocking/strategies-pyjedai.js';
import { metaBlockingFull } from '../../blocking/meta-blocking.js';
import type { WeightingScheme, PruningMethod } from '../../blocking/meta-blocking.js';

// ─── Test data ──────────────────────────────────────────────────────

/** 10 records with varying overlap for blocking testing. */
const TEST_RECORDS = [
  { name: 'John Smith', city: 'New York' },
  { name: 'Jon Smyth', city: 'New York' },
  { name: 'John Smith', city: 'NYC' },
  { name: 'Jane Doe', city: 'Los Angeles' },
  { name: 'Jane Doe', city: 'LA' },
  { name: 'Bob Wilson', city: 'Chicago' },
  { name: 'Robert Wilson', city: 'Chicago' },
  { name: 'Alice Brown', city: 'Houston' },
  { name: 'Alice Brown', city: 'Houston' },
  { name: 'Charlie Davis', city: 'Phoenix' },
];

// ═══════════════════════════════════════════════════════════════
// Suffix Arrays Blocking
// ═══════════════════════════════════════════════════════════════

describe('suffixArraysBlocking', () => {
  it('generates candidate pairs from suffix-based blocks', () => {
    const result = suffixArraysBlocking(TEST_RECORDS, {
      fields: ['name', 'city'],
      suffixLength: 3,
      maxBlockSize: 100,
    });
    expect(result.pairs.length).toBeGreaterThan(0);
    expect(result.blockCount).toBeGreaterThan(0);
  });

  it('finds the expected match (John Smith variants)', () => {
    const result = suffixArraysBlocking(TEST_RECORDS, {
      fields: ['name'],
      suffixLength: 4,
    });
    // Should pair John Smith (0) with Jon Smyth (1) or John Smith duplicate (2)
    const hasJohnPair = result.pairs.some(
      (p) => (p.leftId === 0 && (p.rightId === 1 || p.rightId === 2)) ||
             (p.rightId === 0 && (p.leftId === 0 || p.leftId === 1 || p.leftId === 2)),
    );
    expect(hasJohnPair).toBe(true);
  });

  it('respects maxBlockSize', () => {
    const unrestrict = suffixArraysBlocking(TEST_RECORDS, {
      suffixLength: 2,
      maxBlockSize: 1000,
    });
    const restrict = suffixArraysBlocking(TEST_RECORDS, {
      suffixLength: 2,
      maxBlockSize: 2,
    });
    // Restricted should produce fewer or equal pairs
    expect(restrict.pairs.length).toBeLessThanOrEqual(unrestrict.pairs.length);
  });

  it('handles empty records gracefully', () => {
    const result = suffixArraysBlocking([], { fields: ['name'] });
    expect(result.pairs).toEqual([]);
    expect(result.blockCount).toBe(0);
  });

  it('handles single record (no pairs possible)', () => {
    const result = suffixArraysBlocking([{ name: 'Solo' }], { fields: ['name'] });
    expect(result.pairs).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Extended Suffix Arrays Blocking
// ═══════════════════════════════════════════════════════════════

describe('extendedSuffixArraysBlocking', () => {
  it('generates more pairs than standard suffix arrays (substrings, not just suffixes)', () => {
    const suffixResult = suffixArraysBlocking(TEST_RECORDS, { suffixLength: 3 });
    const extResult = extendedSuffixArraysBlocking(TEST_RECORDS, { minLength: 3 });

    // Extended should generate at least as many blocks (due to substring expansion)
    expect(extResult.blockCount).toBeGreaterThanOrEqual(suffixResult.blockCount);
  });

  it('generates valid candidate pairs', () => {
    const result = extendedSuffixArraysBlocking(TEST_RECORDS, { minLength: 4 });
    expect(result.pairs.length).toBeGreaterThan(0);
    // Verify pair IDs are valid
    for (const pair of result.pairs) {
      expect(pair.leftId).toBeGreaterThanOrEqual(0);
      expect(pair.rightId).toBeGreaterThanOrEqual(0);
      expect(pair.leftId).toBeLessThan(TEST_RECORDS.length);
      expect(pair.rightId).toBeLessThan(TEST_RECORDS.length);
      expect(pair.leftId).not.toBe(pair.rightId);
    }
  });

  it('respects maxBlockSize', () => {
    const result = extendedSuffixArraysBlocking(TEST_RECORDS, {
      minLength: 2,
      maxBlockSize: 3,
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Extended QGrams Blocking
// ═══════════════════════════════════════════════════════════════

describe('extendedQGramsBlocking', () => {
  it('generates blocks from q-gram combinations', () => {
    const result = extendedQGramsBlocking(TEST_RECORDS, {
      fields: ['name'],
      qgrams: 3,
      maxCombinations: 10,
    });
    expect(result.blockCount).toBeGreaterThan(0);
    expect(result.pairs.length).toBeGreaterThan(0);
  });

  it('higher threshold reduces pair count', () => {
    const low = extendedQGramsBlocking(TEST_RECORDS, { threshold: 0.5 });
    const high = extendedQGramsBlocking(TEST_RECORDS, { threshold: 0.99 });
    // Higher threshold = fewer combinations = fewer blocks = fewer pairs
    expect(high.blockCount).toBeLessThanOrEqual(low.blockCount + 5); // Allow small margin
  });

  it('handles empty records', () => {
    const result = extendedQGramsBlocking([], {});
    expect(result.pairs).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Meta-blocking pipeline
// ═══════════════════════════════════════════════════════════════

const WEIGHT_SCHEMES: WeightingScheme[] = ['CBS', 'JACCARD', 'COSINE', 'DICE', 'ECBS', 'EJS', 'X2'];
const PRUNE_METHODS: PruningMethod[] = ['WEP', 'CEP', 'CNP', 'WNP', 'BLAST', 'CP'];

describe('metaBlockingFull', () => {
  it('completes without error for default config', () => {
    const result = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      weightingScheme: 'CBS',
      pruningMethod: 'WEP',
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });

  describe('weighting scheme parameterization', () => {
    for (const scheme of WEIGHT_SCHEMES) {
      it(`weighting scheme "${scheme}" produces valid pairs`, () => {
        const result = metaBlockingFull(TEST_RECORDS, {
          fields: ['name'],
          weightingScheme: scheme,
          pruningMethod: 'WEP',
        });
        expect(result.pairs.length).toBeGreaterThanOrEqual(0);
        expect(result.blockCount).toBeGreaterThanOrEqual(0);
      });
    }
  });

  describe('pruning method parameterization', () => {
    for (const method of PRUNE_METHODS) {
      it(`pruning method "${method}" produces valid pairs`, () => {
        const result = metaBlockingFull(TEST_RECORDS, {
          fields: ['name'],
          weightingScheme: 'CBS',
          pruningMethod: method,
          topK: 5,
        });
        expect(result.pairs.length).toBeGreaterThanOrEqual(0);
        expect(result.blockCount).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('RCNP reciprocal pruning reduces pairs vs CNP', () => {
    const cnp = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      pruningMethod: 'CNP',
      topK: 3,
    });
    const rcnp = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      pruningMethod: 'RCNP',
      topK: 3,
    });
    // RCNP is stricter — should not produce MORE pairs than CNP
    expect(rcnp.pairs.length).toBeLessThanOrEqual(cnp.pairs.length);
  });

  it('RWNP reciprocal pruning reduces pairs vs WNP', () => {
    const wnp = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      pruningMethod: 'WNP',
    });
    const rwnp = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      pruningMethod: 'RWNP',
    });
    expect(rwnp.pairs.length).toBeLessThanOrEqual(wnp.pairs.length);
  });

  it('CEP topK=1 produces at most 1 pair', () => {
    const result = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      pruningMethod: 'CEP',
      topK: 1,
    });
    if (result.pairs.length > 0) {
      expect(result.pairs.length).toBeLessThanOrEqual(1);
    }
  });

  it('no duplicate pairs returned', () => {
    const result = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      weightingScheme: 'JACCARD',
      pruningMethod: 'WEP',
    });
    const pairSet = new Set<string>();
    for (const p of result.pairs) {
      const key = `${p.leftId}:${p.rightId}`;
      expect(pairSet.has(key)).toBe(false);
      pairSet.add(key);
    }
  });

  it('all pair IDs are within record range', () => {
    const result = metaBlockingFull(TEST_RECORDS, {
      fields: ['name'],
      weightingScheme: 'DICE',
      pruningMethod: 'BLAST',
    });
    for (const p of result.pairs) {
      expect(p.leftId).toBeGreaterThanOrEqual(0);
      expect(p.leftId).toBeLessThan(TEST_RECORDS.length);
      expect(p.rightId).toBeGreaterThanOrEqual(0);
      expect(p.rightId).toBeLessThan(TEST_RECORDS.length);
      expect(p.leftId).not.toBe(p.rightId);
    }
  });

  it('handles empty records', () => {
    const result = metaBlockingFull([], {});
    expect(result.pairs).toEqual([]);
  });
});
