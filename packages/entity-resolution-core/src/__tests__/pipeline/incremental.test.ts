// Tests for incremental update engine.

import { describe, it, expect } from 'vitest';
import {
  incrementalAdd,
  incrementalDelete,
  incrementalModify,
  connectedComponents,
} from '../../index.js';
import type { ScoredPair, ClusteringResult } from '../../index.js';

const basePairs: ScoredPair[] = [
  { leftId: 0, rightId: 1, score: 0.95, probability: 0.95 },
  { leftId: 2, rightId: 3, score: 0.9, probability: 0.9 },
];

const baseResult: ClusteringResult = connectedComponents(basePairs, 4, 0.5);

describe('incrementalAdd', () => {
  it('returns existing result for empty new records', async () => {
    const mockMatch = async () => ({ leftId: 0, rightId: 0, score: 1, probability: 1 });
    const result = await incrementalAdd([], baseResult, basePairs, mockMatch, 0.5);
    expect(result.metadata.totalRecords).toBe(4);
  });

  it('handles first batch (full computation)', async () => {
    const empty: ClusteringResult = {
      clusters: new Map(),
      singletons: [],
      metadata: {
        numClusters: 0,
        numSingletons: 0,
        averageClusterSize: 0,
        maxClusterSize: 0,
        totalRecords: 0,
      },
    };
    const mockMatch = async (a: Record<string, unknown>, b: Record<string, unknown>) => ({
      leftId: 0,
      rightId: 1,
      score: a.name === b.name ? 1 : 0,
      probability: a.name === b.name ? 1 : 0,
    });
    const result = await incrementalAdd([{ name: 'A' }, { name: 'A' }], empty, [], mockMatch, 0.5);
    expect(result.metadata.totalRecords).toBeGreaterThan(0);
  });
});

describe('incrementalDelete', () => {
  it('removes deleted records', () => {
    const result = incrementalDelete([0], baseResult, basePairs, 0.5);
    expect(result.metadata.totalRecords).toBe(3); // 4 - 1
  });

  it('handles no deleted records', () => {
    const result = incrementalDelete([], baseResult, basePairs, 0.5);
    expect(result.metadata.totalRecords).toBe(4);
  });
});

describe('incrementalModify', () => {
  it('drops edges for modified records', () => {
    const result = incrementalModify([0], 4, basePairs, 0.5);
    expect(result.metadata.totalRecords).toBe(4);
  });

  it('handles no modified records', () => {
    const result = incrementalModify([], 4, basePairs, 0.5);
    expect(result.metadata.totalRecords).toBe(4);
  });
});
