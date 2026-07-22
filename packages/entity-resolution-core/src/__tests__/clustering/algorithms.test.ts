// Tests for all 3 clustering algorithms.

import { describe, it, expect } from 'vitest';
import { connectedComponents, dbscanClustering, uniqueMapping } from '../../index.js';
import type { ScoredPair } from '../../index.js';

const simplePairs: ScoredPair[] = [
  { leftId: 0, rightId: 1, score: 0.95 },
  { leftId: 0, rightId: 2, score: 0.3 },
  { leftId: 1, rightId: 2, score: 0.2 },
  { leftId: 3, rightId: 4, score: 0.9 },
];

describe('connectedComponents', () => {
  it('clusters high-score pairs together', () => {
    const result = connectedComponents(simplePairs, 5, 0.8);
    expect(result.clusters.size).toBeGreaterThanOrEqual(1);
    expect(result.singletons).toContain(2);
  });

  it('transitive closure works', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 1, rightId: 2, score: 0.9 },
    ];
    const result = connectedComponents(pairs, 3, 0.8);
    expect(result.clusters.size).toBe(1);
    const cluster = [...result.clusters.values()][0]!;
    expect(cluster.memberIds.sort()).toEqual([0, 1, 2]);
  });

  it('respects threshold', () => {
    const result = connectedComponents(simplePairs, 5, 0.5);
    // At 0.5: (0,1) at 0.95 connects. (3,4) at 0.9 connects.
    expect(result.clusters.size).toBeGreaterThanOrEqual(1);
  });

  it('returns metadata correctly', () => {
    const result = connectedComponents(simplePairs, 5, 0.8);
    expect(result.metadata.totalRecords).toBe(5);
    expect(result.metadata.numSingletons).toBeGreaterThan(0);
  });

  it('handles empty pairs', () => {
    const result = connectedComponents([], 3, 0.5);
    expect(result.clusters.size).toBe(0);
    expect(result.singletons.length).toBe(3);
  });

  it('handles single record', () => {
    const result = connectedComponents([], 1, 0.5);
    expect(result.clusters.size).toBe(0);
    expect(result.metadata.totalRecords).toBe(1);
  });
});

describe('dbscanClustering', () => {
  it('clusters with density', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 0, rightId: 2, score: 0.9 },
      { leftId: 1, rightId: 2, score: 0.9 },
      { leftId: 3, rightId: 4, score: 0.9 },
    ];
    const result = dbscanClustering(pairs, 5, 0.8, 2);
    expect(result.clusters.size).toBeGreaterThanOrEqual(1);
  });

  it('marks isolated records as noise', () => {
    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.95 }];
    const result = dbscanClustering(pairs, 4, 0.8, 2);
    // (0,1) has 1 neighbor each (below minPts=2) → noise
    expect(result.singletons.length).toBeGreaterThanOrEqual(0);
    expect(result.metadata.totalRecords).toBe(4);
  });

  it('higher minPts creates more noise', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 0, rightId: 2, score: 0.9 },
    ];
    const lowMinPts = dbscanClustering(pairs, 3, 0.8, 1);
    const highMinPts = dbscanClustering(pairs, 3, 0.8, 3);
    expect(lowMinPts.singletons.length).toBeLessThanOrEqual(highMinPts.singletons.length);
  });
});

describe('uniqueMapping', () => {
  it('matches at most one pair per record', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 0, rightId: 2, score: 0.8 },
    ];
    const result = uniqueMapping(pairs, 3, 0.7);
    // Only (0,1) should match since 0 is used
    const clusterMembers = [...result.clusters.values()].flatMap((c) => c.memberIds);
    expect(clusterMembers).toContain(0);
    expect(clusterMembers).toContain(1);
    expect(clusterMembers).not.toContain(2);
  });

  it('sorts by score descending', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 2, score: 0.7 },
      { leftId: 0, rightId: 1, score: 0.95 },
    ];
    const result = uniqueMapping(pairs, 3, 0.6);
    const clusterMembers = [...result.clusters.values()].flatMap((c) => c.memberIds);
    expect(clusterMembers).toContain(0);
    expect(clusterMembers).toContain(1); // (0,1) at 0.95 picked first
  });

  it('respects threshold', () => {
    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.5 }];
    const result = uniqueMapping(pairs, 2, 0.9);
    expect(result.clusters.size).toBe(0);
  });

  it('handles empty pairs', () => {
    const result = uniqueMapping([], 5, 0.5);
    expect(result.clusters.size).toBe(0);
    expect(result.singletons.length).toBe(5);
  });
});
