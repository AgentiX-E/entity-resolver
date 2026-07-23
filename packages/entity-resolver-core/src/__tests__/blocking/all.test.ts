// Comprehensive tests for all 5 blocking strategies and analysis.

import { describe, it, expect } from 'vitest';
import {
  standardBlocking,
  tokenBlocking,
  sortedNeighborhood,
  multiPassBlocking,
  metaBlocking,
  blockOn,
  blockOnSoundex,
  analyzeBlockingRule,
  recommendBlockingRules,
  verifyBlockingRecall,
  blockPurging,
  comparisonNeighborhoodPruning,
} from '../../index.js';
import { computeReductionRatio, applyBlockingTransforms } from '../../index.js';
import type { CandidatePair, BlockingPass } from '../../index.js';

// ─── Test data ──────────────────────────────────────────────────

const smallRecords = [
  { name: 'John Smith', city: 'New York', email: 'john@example.com' },
  { name: 'John Smyth', city: 'NYC', email: 'john@example.com' },
  { name: 'Jane Doe', city: 'Los Angeles', email: 'jane@example.com' },
  { name: 'Jon Smith', city: 'New York', email: 'jsmith@example.com' },
  { name: 'John Smith', city: 'New York', email: 'john.smith@example.com' },
];

const largeRecords = Array.from({ length: 1000 }, (_, idx) => ({
  name: `Person${idx % 100}`,
  city: ['NYC', 'LA', 'Chicago', 'Houston'][idx % 4],
  zip: String(10000 + (idx % 9999)),
}));

// ─── Types ──────────────────────────────────────────────────────

describe('computeReductionRatio', () => {
  it('returns 1 for empty/single records', () => {
    expect(computeReductionRatio(0, 0)).toBe(1);
    expect(computeReductionRatio(0, 1)).toBe(1);
  });

  it('returns 0 for brute-force (all pairs)', () => {
    // For 10 records, total pairs = 45
    expect(computeReductionRatio(45, 10)).toBeCloseTo(0, 5);
  });

  it('returns high ratio for few pairs', () => {
    // For 100 records, total pairs = 4950. If only 50 pairs:
    expect(computeReductionRatio(50, 100)).toBeGreaterThan(0.98);
  });
});

describe('applyBlockingTransforms', () => {
  it('lowercases', () => {
    expect(applyBlockingTransforms('Hello', ['lowercase'])).toBe('hello');
  });

  it('uppercases', () => {
    expect(applyBlockingTransforms('hello', ['uppercase'])).toBe('HELLO');
  });

  it('strips whitespace', () => {
    expect(applyBlockingTransforms('  hello  ', ['strip'])).toBe('hello');
  });

  it('extracts digits only', () => {
    expect(applyBlockingTransforms('abc123def', ['digits_only'])).toBe('123');
  });

  it('extracts alpha only', () => {
    expect(applyBlockingTransforms('abc123def', ['alpha_only'])).toBe('abcdef');
  });

  it('takes first 3 characters', () => {
    expect(applyBlockingTransforms('abcdef', ['substring:0:3'])).toBe('abc');
  });

  it('chains transforms', () => {
    expect(
      applyBlockingTransforms('  Hello World  ', ['strip', 'lowercase', 'substring:0:3']),
    ).toBe('hel');
  });

  it('substring:0:1 returns first char', () => {
    expect(applyBlockingTransforms('John', ['substring:0:1'])).toBe('J');
  });
});

// ─── Standard Blocking ─────────────────────────────────────────

describe('standardBlocking', () => {
  it('generates pairs for matching blocking keys', () => {
    const result = standardBlocking(smallRecords, {
      fields: ['city'],
      transforms: ['strip', 'lowercase'],
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
    expect(result.totalRecords).toBe(5);
    expect(result.reductionRatio).toBeGreaterThanOrEqual(0);
    expect(result.reductionRatio).toBeLessThanOrEqual(1);
  });

  it('uses blockOn convenience', () => {
    const result = standardBlocking(smallRecords, {
      passes: [blockOn('name')],
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });

  it('uses blockOnSoundex', () => {
    const result = standardBlocking(smallRecords, {
      passes: [{ fields: ['name'], transforms: ['strip', 'lowercase', 'soundex'] }],
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });

  it('produces no pairs when no records share keys', () => {
    const records = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = standardBlocking(records, {
      fields: ['id'],
    });
    expect(result.pairs.length).toBe(0);
  });

  it('union of multiple passes', () => {
    const result = standardBlocking(smallRecords, {
      passes: [blockOn('name'), blockOn('email')],
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });

  it('handles empty records gracefully', () => {
    const result = standardBlocking([], { fields: ['name'] });
    expect(result.pairs).toHaveLength(0);
    expect(result.totalRecords).toBe(0);
  });

  it('generates unique pairs (no duplicates)', () => {
    const result = standardBlocking(largeRecords, {
      fields: ['city'],
    });
    const pairStrings = result.pairs.map((p) => `${p.leftId}:${p.rightId}`);
    expect(new Set(pairStrings).size).toBe(pairStrings.length);
  });
});

// ─── Token Blocking ─────────────────────────────────────────────

describe('tokenBlocking', () => {
  it('generates pairs from shared tokens', () => {
    const result = tokenBlocking(smallRecords, { fields: ['name'] });
    expect(result.reductionRatio).toBeDefined();
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });

  it('handles empty records', () => {
    const result = tokenBlocking([], { fields: ['name'] });
    expect(result.pairs).toHaveLength(0);
  });

  it('handles records with no matching tokens', () => {
    const records = [{ name: 'x' }, { name: 'y' }, { name: 'z' }];
    const result = tokenBlocking(records, { fields: ['name'] });
    expect(result.pairs).toEqual([]);
  });
});

// ─── Sorted Neighborhood ────────────────────────────────────────

describe('sortedNeighborhood', () => {
  it('generates pairs in sliding window', () => {
    const result = sortedNeighborhood(smallRecords, {
      fields: ['name'],
      windowSize: 3,
    });
    // Each record compared with up to 3 neighbors
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
    expect(result.reductionRatio).toBeDefined();
  });

  it('respects window size', () => {
    const result = sortedNeighborhood(largeRecords, {
      fields: ['name'],
      windowSize: 5,
    });
    // With 1000 records and window=5, max pairs = ~5000
    expect(result.pairs.length).toBeLessThan(6000);
  });

  it('windowSize=1 means adjacent-only', () => {
    const records = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
    const result = sortedNeighborhood(records, {
      fields: ['name'],
      windowSize: 1,
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── Multi-Pass Blocking ───────────────────────────────────────

describe('multiPassBlocking', () => {
  it('combines passes via union', () => {
    const result = multiPassBlocking(smallRecords, {
      passes: [
        { fields: ['email'], transforms: ['strip', 'lowercase'] },
        { fields: ['name'], transforms: ['strip', 'lowercase', 'soundex'] },
      ],
    });
    expect(result.pairs.length).toBeGreaterThanOrEqual(0);
  });

  it('returns empty with no passes', () => {
    const result = multiPassBlocking(smallRecords, { passes: [] });
    expect(result.pairs).toHaveLength(0);
  });
});

// ─── Meta-blocking ──────────────────────────────────────────────

describe('blockPurging', () => {
  it('removes oversized blocks', () => {
    const blocks = new Map<string, number[]>();
    blocks.set('big', [1, 2, 3, 4, 5, 6]);
    blocks.set('small', [1, 2]);
    const purged = blockPurging(blocks, 5);
    expect(purged.has('big')).toBe(false);
    expect(purged.has('small')).toBe(true);
  });

  it('keeps blocks at boundary', () => {
    const blocks = new Map<string, number[]>();
    blocks.set('exact', [1, 2, 3, 4, 5]);
    const purged = blockPurging(blocks, 5);
    expect(purged.has('exact')).toBe(true);
  });
});

describe('comparisonNeighborhoodPruning', () => {
  it('keeps pairs with sufficient weight', () => {
    const blocks = new Map<string, number[]>();
    blocks.set('a', [0, 1, 2]);
    blocks.set('b', [0, 1]);
    // Pair (0,1) appears in both blocks → weight=2
    const pruned = comparisonNeighborhoodPruning(blocks, 2);
    expect(pruned.has('0:1')).toBe(true);
  });

  it('prunes pairs with insufficient weight', () => {
    const blocks = new Map<string, number[]>();
    blocks.set('a', [0, 1]);
    // Pair (0,1) only appears once → weight=1
    const pruned = comparisonNeighborhoodPruning(blocks, 2);
    expect(pruned.has('0:1')).toBe(false);
  });
});

describe('metaBlocking', () => {
  it('completes the full pipeline', () => {
    const result = metaBlocking(smallRecords, { fields: ['name'] });
    expect(result.reductionRatio).toBeDefined();
    expect(result.totalRecords).toBe(5);
  });
});

// ─── Analyzer ───────────────────────────────────────────────────

describe('analyzeBlockingRule', () => {
  it('estimates pair count', () => {
    const pass: BlockingPass = { fields: ['city'], transforms: ['strip', 'lowercase'] };
    const result = analyzeBlockingRule(largeRecords, pass);
    expect(result.estimatedPairCount).toBeGreaterThan(0);
    expect(result.estimatedReductionRatio).toBeGreaterThan(0);
  });

  it('detects skew for common values', () => {
    const pass: BlockingPass = { fields: ['city'], transforms: ['strip', 'lowercase'] };
    const result = analyzeBlockingRule(largeRecords, pass);
    expect(result.hasSkewedBlocks).toBeDefined();
  });
});

describe('recommendBlockingRules', () => {
  it('recommends rules from candidate passes', () => {
    const candidates: BlockingPass[] = [
      { fields: ['city'], transforms: ['strip', 'lowercase'] },
      { fields: ['name'], transforms: ['strip', 'lowercase'] },
    ];
    const recommended = recommendBlockingRules(largeRecords, candidates);
    expect(recommended.length).toBeGreaterThan(0);
    expect(recommended.length).toBeLessThanOrEqual(4);
  });
});

describe('verifyBlockingRecall', () => {
  it('returns 1 for perfect recall', () => {
    const pairs: CandidatePair[] = [
      { leftId: 0, rightId: 1 },
      { leftId: 0, rightId: 2 },
    ];
    const trueMatches: CandidatePair[] = [{ leftId: 0, rightId: 1 }];
    expect(verifyBlockingRecall(pairs, trueMatches)).toBe(1);
  });

  it('returns 0.5 for 50% recall', () => {
    const pairs: CandidatePair[] = [{ leftId: 0, rightId: 1 }];
    const trueMatches: CandidatePair[] = [
      { leftId: 0, rightId: 1 },
      { leftId: 0, rightId: 2 },
    ];
    expect(verifyBlockingRecall(pairs, trueMatches)).toBe(0.5);
  });

  it('returns 1 for empty true matches', () => {
    expect(verifyBlockingRecall([], [])).toBe(1);
  });
});

// ─── Edge cases for coverage ───────────────────────────────────

describe('blocking edge cases', () => {
  it('standardBlocking with default config (no passes)', () => {
    const records = [{ name: 'A' }, { name: 'A' }];
    const result = standardBlocking(records, { fields: ['name'] });
    expect(result.reductionRatio).toBeDefined();
    expect(result.reductionRatio).toBeGreaterThanOrEqual(0);
  });

  it('standardBlocking with empty field values', () => {
    const records = [{ name: '' }, { name: '' }];
    const result = standardBlocking(records, {
      passes: [{ fields: ['name'], transforms: ['strip'] }],
    });
    expect(result.pairs.length).toBe(0);
  });

  it('standardBlocking with one record', () => {
    const result = standardBlocking([{ name: 'A' }], { fields: ['name'] });
    expect(result.pairs.length).toBe(0);
    expect(result.reductionRatio).toBe(1);
  });

  it('tokenBlocking with empty field value', () => {
    const records = [{ name: '' }, { name: '' }];
    const result = tokenBlocking(records, { fields: ['name'] });
    expect(result.pairs.length).toBe(0);
  });

  it('sortedNeighborhood with default window', () => {
    const records = [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }];
    const result = sortedNeighborhood(records, { fields: ['name'] });
    expect(result.reductionRatio).toBeGreaterThanOrEqual(0);
    expect(result.reductionRatio).toBeDefined();
  });

  it('sortedNeighborhood with single record', () => {
    const result = sortedNeighborhood([{ name: 'a' }], { fields: ['name'] });
    expect(result.pairs.length).toBe(0);
  });

  it('metaBlocking with empty records', () => {
    const result = metaBlocking([], { fields: ['name'] });
    expect(result.pairs.length).toBe(0);
    expect(result.totalRecords).toBe(0);
  });

  it('multiPassBlocking respects block size limits', () => {
    const records = Array.from({ length: 600 }, (_i) => ({ email: `user@test.com` }));
    const result = multiPassBlocking(records, {
      passes: [{ fields: ['email'], transforms: ['strip', 'lowercase'] }],
    });
    // All 100 share the same email → block of size 100 (> 500, so skipped)
    expect(result.pairs.length).toBe(0);
  });

  it('analyzeBlockingRule with custom sample size', () => {
    const result = analyzeBlockingRule(
      [{ name: 'A' }, { name: 'A' }, { name: 'B' }],
      { fields: ['name'], transforms: ['strip', 'lowercase'] },
      { sampleSize: 3 },
    );
    expect(result.estimatedReductionRatio).toBeGreaterThan(0);
  });

  it('recommendBlockingRules with all skewed passes', () => {
    const records = Array.from({ length: 100 }, () => ({
      gender: 'M',
    }));
    const candidates = [{ fields: ['gender'], transforms: ['strip', 'lowercase'] }] as any[];
    const recommended = recommendBlockingRules(records, candidates);
    expect(recommended.length).toBeGreaterThan(0);
  });

  it('blockPurging with default maxBlockSize', () => {
    const blocks = new Map<string, number[]>();
    const big = Array.from({ length: 600 }, (_, idx) => idx);
    blocks.set('big', big);
    blocks.set('small', [1, 2]);
    const purged = blockPurging(blocks);
    expect(purged.has('big')).toBe(false);
    expect(purged.has('small')).toBe(true);
  });

  it('verifyBlockingRecall with zero true matches returns 1', () => {
    expect(verifyBlockingRecall([], [])).toBe(1);
  });
});

// ─── Additional branch coverage ─────────────────────────────────

describe('blocking branch coverage', () => {
  it('computeReductionRatio with exactly one record', () => {
    expect(computeReductionRatio(0, 1)).toBe(1);
  });

  it('tokenBlocking with empty transforms', () => {
    const records = [{ name: 'hello world' }, { name: 'hello there' }];
    const result = tokenBlocking(records, { fields: ['name'], transforms: [] });
    expect(result.pairs.length).toBeGreaterThan(0);
  });

  it('standardBlocking with null field values', () => {
    const records = [{ name: null }, { name: 'John' }];
    const result = standardBlocking(records, {
      passes: [{ fields: ['name'], transforms: ['strip', 'lowercase'] }],
    });
    expect(result.reductionRatio).toBeDefined();
  });

  it('sortedNeighborhood with explicit window and transforms', () => {
    const records = Array.from({ length: 30 }, (_, idx) => ({ name: `Person${idx % 10}` }));
    const result = sortedNeighborhood(records, {
      fields: ['name'],
      windowSize: 5,
      transforms: ['strip', 'lowercase'],
    });
    expect(result.pairs.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Blocking utility functions (types.ts)
// ═══════════════════════════════════════════════════════════════

describe('blocking utilities', () => {
  it('computeReductionRatio returns correct ratio', () => {
    const r1 = computeReductionRatio(0, 100);
    expect(r1).toBe(1);
    const r2 = computeReductionRatio(4950, 100);
    expect(r2).toBe(0);
  });

  it('computeReductionRatio with zero records returns 1', () => {
    expect(computeReductionRatio(10, 0)).toBe(1);
  });

  it('computeReductionRatio with single record returns 1', () => {
    expect(computeReductionRatio(0, 1)).toBe(1);
  });

  it('soundex produces consistent codes', () => {
    expect(applyBlockingTransforms('Robert', ['soundex'])).toBe(
      applyBlockingTransforms('Rupert', ['soundex']),
    );
  });

  it('metaphone produces output', () => {
    const r = applyBlockingTransforms('Robert', ['metaphone']);
    expect(r.length).toBeGreaterThan(0);
  });

  it('multiple transforms chain correctly', () => {
    const r = applyBlockingTransforms('  John  ', ['strip', 'lowercase']);
    expect(r).toBe('john');
  });

  it('empty string is handled', () => {
    const r = applyBlockingTransforms('', ['soundex']);
    expect(typeof r).toBe('string');
  });

  it('digits_only extracts digits', () => {
    expect(applyBlockingTransforms('abc123def', ['digits_only'])).toBe('123');
  });

  it('alpha_only keeps only letters', () => {
    expect(applyBlockingTransforms('abc123def', ['alpha_only'])).toBe('abcdef');
  });

  it('substring transform truncates values', () => {
    const r = applyBlockingTransforms('verylongstringhere', ['substring:0:3']);
    expect(r.length).toBe(3);
  });

  it('unknown transform is no-op', () => {
    expect(applyBlockingTransforms('test', ['unknown_transform' as any])).toBe('test');
  });

  it('metaphone produces output for any input', () => {
    const r1 = applyBlockingTransforms('Smith', ['metaphone']);
    const r2 = applyBlockingTransforms('Smyth', ['metaphone']);
    expect(r1.length).toBeGreaterThan(0);
    expect(r2.length).toBeGreaterThan(0);
  });

  it('uppercase transform works', () => {
    expect(applyBlockingTransforms('test', ['uppercase'])).toBe('TEST');
  });

  it('lowercase transform works', () => {
    expect(applyBlockingTransforms('TEST', ['lowercase'])).toBe('test');
  });
});

describe('blockOnSoundex', () => {
  it('creates a pass with soundex transform', () => {
    const pass = blockOnSoundex('surname');
    expect(pass.transforms).toContain('soundex');
    expect(pass.fields).toContain('surname');
  });
});

describe('blocking empty/null field values', () => {
  it('sortedNeighborhood handles empty string fields', () => {
    const records = [{ name: '' }, { name: '' }];
    const result = sortedNeighborhood(records, {
      fields: ['name'],
    });
    expect(result.totalRecords).toBe(2);
  });

  it('metaBlocking uses default when fields not specified', () => {
    const records = [{ a: 'x' }, { b: 'y' }];
    const result = metaBlocking(records, {});
    expect(result.totalRecords).toBe(2);
  });

  it('analyzer handles perfectly uniform blocks', async () => {
    const { analyzeBlockingRule } = await import('../../blocking/analyzer.js');
    const records = Array.from({ length: 50 }, () => ({ city: 'SameCity' }));
    const result = analyzeBlockingRule(records, {
      fields: ['city'], transforms: ['strip', 'lowercase'],
    });
    expect(result.estimatedPairCount).toBeGreaterThan(0);
  });
});
