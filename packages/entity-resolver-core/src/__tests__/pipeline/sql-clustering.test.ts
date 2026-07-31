// Tests for connected components clustering correctness in the SQL pipeline path.
// Verifies transitive closure: (a,b) + (b,c) → single cluster {a,b,c}.
// These tests do not require a DuckDB backend — they verify the algorithm directly.

import { describe, it, expect } from 'vitest';
import { connectedComponents } from '../../index.js';
import type { ScoredPair } from '../../types/core.js';

function makePair(leftId: number, rightId: number, score = 0.9): ScoredPair {
  return { leftId, rightId, score, probability: score };
}

describe('connectedComponents (SQL pipeline clustering)', () => {
  // ── Transitive closure verification ──
  it('chain (1,2) + (2,3) → single cluster {1,2,3}', () => {
    const pairs = [makePair(1, 2), makePair(2, 3)];
    const result = connectedComponents(pairs, 4, 0.5);
    expect(result.metadata.numClusters).toBe(1);
    expect(result.singletons).toEqual([0]);
    const clusterIds = [...result.clusters.keys()];
    expect(clusterIds).toHaveLength(1);
    const members = [...result.clusters.get(clusterIds[0]!)!.memberIds].sort((a, b) => a - b);
    expect(members).toEqual([1, 2, 3]);
  });

  it('two independent pairs → two clusters', () => {
    const pairs = [makePair(1, 2), makePair(3, 4)];
    const result = connectedComponents(pairs, 5, 0.5);
    expect(result.metadata.numClusters).toBe(2);
    expect(result.singletons).toEqual([0]);
  });

  it('triangle (1,2)+(2,3)+(1,3) → single cluster {1,2,3}', () => {
    const pairs = [makePair(1, 2), makePair(2, 3), makePair(1, 3)];
    const result = connectedComponents(pairs, 4, 0.5);
    expect(result.metadata.numClusters).toBe(1);
    const clusterIds = [...result.clusters.keys()];
    const members = [...result.clusters.get(clusterIds[0]!)!.memberIds].sort((a, b) => a - b);
    expect(members).toEqual([1, 2, 3]);
  });

  it('long chain (1,2)+(2,3)+(3,4)+(4,5) → single cluster {1,2,3,4,5}', () => {
    const pairs = [makePair(1, 2), makePair(2, 3), makePair(3, 4), makePair(4, 5)];
    const result = connectedComponents(pairs, 6, 0.5);
    expect(result.metadata.numClusters).toBe(1);
    const clusterIds = [...result.clusters.keys()];
    const members = [...result.clusters.get(clusterIds[0]!)!.memberIds].sort((a, b) => a - b);
    expect(members).toEqual([1, 2, 3, 4, 5]);
  });

  it('unmatched elements become singletons', () => {
    const pairs = [makePair(1, 2)];
    const result = connectedComponents(pairs, 5, 0.5);
    // Records 0, 3, 4 are singletons (no pairs)
    expect([...result.singletons].sort((a, b) => a - b)).toEqual([0, 3, 4]);
    expect(result.metadata.numSingletons).toBe(3);
  });

  // ── Threshold behavior ──
  it('pairs below threshold are ignored', () => {
    const pairs = [makePair(1, 2, 0.3), makePair(2, 3, 0.9)];
    const result = connectedComponents(pairs, 4, 0.5);
    // Only (2,3) above threshold
    expect(result.metadata.numClusters).toBe(1);
    expect([...result.singletons].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('all pairs below threshold → all singletons', () => {
    const pairs = [makePair(1, 2, 0.3), makePair(3, 4, 0.1)];
    const result = connectedComponents(pairs, 5, 0.5);
    expect(result.metadata.numClusters).toBe(0);
    expect(result.metadata.numSingletons).toBe(5);
  });

  // ── Metadata correctness ──
  it('reports correct metadata', () => {
    const pairs = [
      makePair(1, 2),
      makePair(1, 3),
      makePair(4, 5),
    ];
    const result = connectedComponents(pairs, 7, 0.5);
    expect(result.metadata.numClusters).toBe(2); // {1,2,3}, {4,5}
    expect(result.metadata.numSingletons).toBe(2); // 0, 6
    expect(result.metadata.averageClusterSize).toBeCloseTo(2.5, 5);
    expect(result.metadata.maxClusterSize).toBe(3);
    expect(result.metadata.totalRecords).toBe(7);
  });

  // ── Edge cases ──
  it('empty pairs → all singletons', () => {
    const result = connectedComponents([], 3, 0.5);
    expect(result.metadata.numClusters).toBe(0);
    expect(result.metadata.numSingletons).toBe(3);
    expect(result.singletons).toEqual([0, 1, 2]);
  });

  it('zero records → empty result', () => {
    const result = connectedComponents([], 0, 0.5);
    expect(result.metadata.numClusters).toBe(0);
    expect(result.metadata.numSingletons).toBe(0);
    expect(result.metadata.totalRecords).toBe(0);
  });
});
