// I19: Branch coverage sprint — targeted tests for low-coverage core branches.
import { describe, it, expect } from 'vitest';
import type { ScoredPair } from '../types/core.js';
import type { ClusteringResult } from '../clustering/algorithms.js';

const meta = { numSingletons: 0, totalRecords: 0 };

// ═══════════════════════════════════════════════════════════════
// Incremental Updates
// ═══════════════════════════════════════════════════════════════

import { incrementalAdd, incrementalDelete, incrementalModify } from '../pipeline/incremental.js';

const mf = async (): Promise<ScoredPair> => ({ leftId: 0, rightId: 1, score: 1, probability: 1 });
const empty: ClusteringResult = { clusters: new Map(), singletons: [], metadata: { numClusters: 0, ...meta, averageClusterSize: 0, maxClusterSize: 0 } };

describe('incremental edge cases', () => {
  it('incrementalAdd empty newRecords returns existing', async () => {
    const r = await incrementalAdd([], [{ name: 'A' }], empty, [], mf, 0.5);
    expect(r).toBe(empty);
  });

  it('incrementalDelete empty deletedIds returns existing', () => {
    const r = incrementalDelete([], empty, [], 0.5);
    expect(r).toBe(empty);
  });

  it('incrementalModify empty modifiedIds returns result', async () => {
    const r = await incrementalModify([], [{ name: 'A' }], [], mf, 0.5);
    expect(r).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Auto-Config
// ═══════════════════════════════════════════════════════════════

import { detectFields, autoConfigure } from '../auto-config/detector.js';

describe('auto-config edge cases', () => {
  it('detectFields with single record', () => {
    const fields = detectFields([{ name: 'Alice', email: 'a@test.com', dob: '1990-01-15' }]);
    expect(fields.length).toBe(3);
  });

  it('autoConfigure with mixed types', () => {
    const records = [
      { name: 'Alice', age: '30', city: 'NYC', email: 'a@test.com' },
      { name: 'Bob', age: '25', city: 'LA', email: 'b@test.com' },
    ];
    const result = autoConfigure(records);
    expect(result.config.comparisons.length).toBeGreaterThan(0);
  });

  it('autoConfigure with numeric fields only', () => {
    const result = autoConfigure([{ id: '1', price: '100' }, { id: '2', price: '200' }]);
    expect(result.config).toBeDefined();
  });

  it('autoConfigure single record', () => {
    const result = autoConfigure([{ name: 'Only', email: 'test@test.com' }]);
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('autoConfigure tfFields for surname types', () => {
    const records = [{ name: 'John', surname: 'Smith' }, { name: 'Jane', surname: 'Smith' }];
    const result = autoConfigure(records);
    expect(result.config.tfFields).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Field Independence
// ═══════════════════════════════════════════════════════════════

import { analyzeFieldCorrelations } from '../fellegi-sunter/field-independence.js';

describe('field independence', () => {
  it('returns report with warnings array', () => {
    const records = [{ name: 'A', email: 'a@t.com' }, { name: 'A', email: 'a2@t.com' }];
    const r = analyzeFieldCorrelations(records, ['name', 'email']);
    expect(Array.isArray(r.warnings)).toBe(true);
  });

  it('single field produces no correlations', () => {
    const r = analyzeFieldCorrelations([{ name: 'Alice' }], ['name']);
    expect(r.warnings).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Block Purging
// ═══════════════════════════════════════════════════════════════

import { blockPurging } from '../blocking/strategies.js';

describe('blockPurging', () => {
  it('zero maxBlockSize purges all', () => {
    expect(blockPurging(new Map([['b1', [0, 1]]]), 0).size).toBe(0);
  });

  it('large maxBlockSize keeps all', () => {
    expect(blockPurging(new Map([['b1', [0, 1]]]), 10).size).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Composable Blocking
// ═══════════════════════════════════════════════════════════════

import { intersectPairs, unionPairs, subtractPairs } from '../blocking/composable.js';
import type { BlockingResult } from '../blocking/types.js';

function br(pairs: Array<{ leftId: number; rightId: number }>, total = 4): BlockingResult {
  return { pairs, blockCount: 1, totalRecords: total, reductionRatio: 0 };
}

describe('composable blocking', () => {
  it('intersectPairs empty returns empty', () => {
    expect(intersectPairs([]).pairs).toEqual([]);
  });

  it('intersectPairs single result identity', () => {
    const r = br([{ leftId: 0, rightId: 1 }]);
    expect(intersectPairs([r]).pairs).toEqual(r.pairs);
  });

  it('intersectPairs finds common pairs', () => {
    const r1 = br([{ leftId: 0, rightId: 1 }, { leftId: 0, rightId: 2 }]);
    const r2 = br([{ leftId: 0, rightId: 1 }, { leftId: 1, rightId: 2 }]);
    expect(intersectPairs([r1, r2]).pairs.length).toBe(1);
  });

  it('unionPairs deduplicates', () => {
    const r1 = br([{ leftId: 0, rightId: 1 }]);
    const r2 = br([{ leftId: 0, rightId: 1 }, { leftId: 1, rightId: 2 }]);
    expect(unionPairs([r1, r2]).pairs.length).toBe(2);
  });

  it('subtractPairs excludes', () => {
    const inc = br([{ leftId: 0, rightId: 1 }, { leftId: 0, rightId: 2 }]);
    const exc = [br([{ leftId: 0, rightId: 1 }])];
    expect(subtractPairs(inc, exc).pairs.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Record Linking
// ═══════════════════════════════════════════════════════════════

import { gazetteerMatch, linkRecords } from '../pipeline/linking.js';

describe('record linking edge cases', () => {
  const comps = [
    { field: 'name', scorerName: 'exact', levels: [{ label: 'exact_match', threshold: 0.99 }] },
  ];

  it('gazetteerMatch empty queries', async () => {
    const r = await gazetteerMatch([], [{ name: 'A' }], { comparisons: comps, matchThreshold: 0.5 });
    expect(r.queryToIndexMatches.length).toBe(0);
  });

  it('linkRecords empty right', async () => {
    const r = await linkRecords([{ name: 'A' }], [], { comparisons: comps, matchThreshold: 0.5 });
    expect(r.crossPairs.length).toBe(0);
  });
});
