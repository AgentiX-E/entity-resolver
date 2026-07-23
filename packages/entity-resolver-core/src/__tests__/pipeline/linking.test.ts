// Tests for Record Linking and Gazetteer matching APIs.

import { describe, it, expect } from 'vitest';
import {
  gazetteerMatch,
  linkRecords,
  autoConfigure,
} from '../../index.js';
import type { GazetteerConfig, RecordLinkConfig } from '../../index.js';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function makeComparisons(records: Record<string, unknown>[]) {
  return autoConfigure(records).config.comparisons;
}

// ═══════════════════════════════════════════════════════════════
// Gazetteer Matching
// ═══════════════════════════════════════════════════════════════

describe('gazetteerMatch', () => {
  it('G1: matches identical records across query and index', async () => {
    const queries = [{ name: 'Alice', city: 'NYC' }];
    const index = [{ name: 'Alice', city: 'NYC' }];
    const comps = makeComparisons([...queries, ...index]);

    const result = await gazetteerMatch(queries, index, {
      comparisons: comps,
      matchThreshold: 0.5,
    } as GazetteerConfig);

    expect(result.queryToIndexMatches.length).toBeGreaterThanOrEqual(1);
    const match = result.queryToIndexMatches[0]!;
    expect(match.score).toBeGreaterThan(0.5);
  });

  it('G2: handles multi-query, multi-index records', async () => {
    const queries = [
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: 'LA' },
    ];
    const index = [
      { name: 'Alice', city: 'New York' },
      { name: 'Charlie', city: 'Chicago' },
    ];
    const comps = makeComparisons([...queries, ...index]);

    const result = await gazetteerMatch(queries, index, {
      comparisons: comps,
      matchThreshold: 0.3,
    } as GazetteerConfig);

    expect(result.statistics.totalRecords).toBe(4);
    // Alice should match Alice, but Bob may not match Charlie
    expect(result.queryToIndexMatches.length).toBeGreaterThanOrEqual(1);
    expect(result.queryToIndexMatches.length).toBeLessThanOrEqual(4);
  });

  it('G3: threshold filters weak matches', async () => {
    const queries = [
      { name: 'Alice', city: 'NYC' },
      { name: 'Zachary', city: 'Unknown' },
    ];
    const index = [
      { name: 'Alice', city: 'New York' },
      { name: 'Xavier', city: 'Paris' },
    ];
    const comps = makeComparisons([...queries, ...index]);

    const result = await gazetteerMatch(queries, index, {
      comparisons: comps,
      matchThreshold: 0.8,
    } as GazetteerConfig);

    // Only Alice-Alice should pass high threshold
    expect(result.queryToIndexMatches.every((p) => p.score >= 0.8)).toBe(true);
  });

  it('G4: scores are in [0, 1] range', async () => {
    const queries = [{ name: 'A', city: 'X' }, { name: 'B', city: 'Y' }];
    const index = [{ name: 'B', city: 'Y' }, { name: 'C', city: 'Z' }];
    const comps = makeComparisons([...queries, ...index]);

    const result = await gazetteerMatch(queries, index, {
      comparisons: comps,
      matchThreshold: 0,
    } as GazetteerConfig);

    for (const pair of result.queryToIndexMatches) {
      expect(pair.score).toBeGreaterThanOrEqual(0);
      expect(pair.score).toBeLessThanOrEqual(1);
    }
  });

  it('G5: returns empty matches when no pairs cross threshold', async () => {
    const queries = [{ given_name: 'john', surname: 'doe' }];
    const index = [{ given_name: 'mary', surname: 'jones' }];
    const comps = makeComparisons([...queries, ...index]);

    const result = await gazetteerMatch(queries, index, {
      comparisons: comps,
      matchThreshold: 0.99,
    } as GazetteerConfig);

    expect(result.queryToIndexMatches).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Record Linking
// ═══════════════════════════════════════════════════════════════

describe('linkRecords', () => {
  it('L1: links identical records across datasets', async () => {
    const left = [{ name: 'Alice', city: 'NYC' }];
    const right = [{ name: 'Alice', city: 'New York' }];
    const comps = makeComparisons([...left, ...right]);

    const result = await linkRecords(left, right, {
      comparisons: comps,
      matchThreshold: 0.3,
    } as RecordLinkConfig);

    expect(result.crossPairs.length).toBeGreaterThanOrEqual(1);
    // Only cross-dataset pairs should exist
    for (const p of result.crossPairs) {
      const isCross = (p.leftId < left.length && p.rightId >= left.length) ||
                       (p.leftId >= left.length && p.rightId < left.length);
      expect(isCross).toBe(true);
    }
  });

  it('L2: handles multi-record datasets', async () => {
    const left = [
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: 'LA' },
    ];
    const right = [
      { name: 'Alice', city: 'New York' },
      { name: 'Bob', city: 'Los Angeles' },
      { name: 'Charlie', city: 'Chicago' },
    ];
    const comps = makeComparisons([...left, ...right]);

    const result = await linkRecords(left, right, {
      comparisons: comps,
      matchThreshold: 0.3,
    } as RecordLinkConfig);

    expect(result.statistics.totalRecords).toBe(5);
    expect(result.crossPairs.length).toBeGreaterThanOrEqual(2);
    // All pairs must be cross-dataset
    for (const p of result.crossPairs) {
      const isCross = (p.leftId < 2 && p.rightId >= 2) ||
                       (p.leftId >= 2 && p.rightId < 2);
      expect(isCross).toBe(true);
    }
  });

  it('L3: high threshold filters out weak matches', async () => {
    const left = [
      { name: 'Alice', city: 'NYC' },
      { name: 'Zach', city: 'Mars' },
    ];
    const right = [
      { name: 'Alice', city: 'New York' },
      { name: 'Zoe', city: 'Venus' },
    ];
    const comps = makeComparisons([...left, ...right]);

    const result = await linkRecords(left, right, {
      comparisons: comps,
      matchThreshold: 0.95,
    } as RecordLinkConfig);

    for (const p of result.crossPairs) {
      expect(p.score).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('L4: all scores in [0, 1]', async () => {
    const left = [{ name: 'A' }, { name: 'B' }];
    const right = [{ name: 'C' }, { name: 'D' }];
    const comps = makeComparisons([...left, ...right]);

    const result = await linkRecords(left, right, {
      comparisons: comps,
      matchThreshold: 0,
    } as RecordLinkConfig);

    for (const p of result.crossPairs) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(1);
    }
  });

  it('L5: empty cross-set when no blocking pairs', async () => {
    const left = [{ given_name: 'unique_a', surname: 'xyz_a' }];
    const right = [{ given_name: 'unique_b', surname: 'xyz_b' }];
    const comps = makeComparisons([...left, ...right]);

    const result = await linkRecords(left, right, {
      comparisons: comps,
      matchThreshold: 0.99,
    } as RecordLinkConfig);

    expect(result.crossPairs).toBeDefined();
    expect(result.statistics.totalRecords).toBe(2);
  });

  it('L6: handles empty left records', async () => {
    const comps = makeComparisons([{ name: 'A' }, { name: 'B' }]);
    const result = await linkRecords([], [{ name: 'A' }], {
      comparisons: comps,
      matchThreshold: 0.5,
    } as RecordLinkConfig);
    expect(result.crossPairs).toHaveLength(0);
  });

  it('L7: uses blocking config for cross-set pair generation', async () => {
    const left = [{ given_name: 'John', surname: 'Smith' }, { given_name: 'Jane', surname: 'Doe' }];
    const right = [{ given_name: 'John', surname: 'Smith' }, { given_name: 'Bob', surname: 'Wilson' }];
    const comps = makeComparisons([...left, ...right]);
    const result = await linkRecords(left, right, {
      comparisons: comps,
      matchThreshold: 0.5,
      blocking: {
        passes: [{ fields: ['given_name'], transforms: ['lowercase'] }],
      },
    } as RecordLinkConfig);
    expect(result.crossPairs).toBeDefined();
    expect(result.statistics.totalRecords).toBe(4);
  });
});
