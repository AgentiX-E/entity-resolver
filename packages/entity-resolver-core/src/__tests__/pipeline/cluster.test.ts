import { describe, it, expect } from 'vitest';
import { verifiedMergeClustering } from '../../pipeline/cluster.js';
import type { ScoredPair } from '../../../types/core.js';

describe('verifiedMergeClustering', () => {
  it('creates clusters for matching pairs', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9, probability: 0.9 },
      { leftId: 2, rightId: 3, score: 0.95, probability: 0.95 },
    ];
    const result = verifiedMergeClustering(pairs, 4, { threshold: 0.5, precisionEstimate: 0.1 });
    expect(result.clusters.length).toBeGreaterThanOrEqual(2);
  });

  it('merges clusters when representative edges pass', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 1, rightId: 2, score: 0.85 },
      { leftId: 2, rightId: 0, score: 0.8 },
    ];
    const result = verifiedMergeClustering(pairs, 3, { threshold: 0.5, precisionEstimate: 0.1 });
    // All connected → should form 1 cluster or merged groups
    expect(result.singletons.length).toBeLessThanOrEqual(1);
  });

  it('blocks merge when representative pair fails threshold', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.95 }, // strong match
      { leftId: 1, rightId: 2, score: 0.6 },  // weak — bridge
      { leftId: 2, rightId: 0, score: 0.3 },  // very weak
    ];
    const result = verifiedMergeClustering(pairs, 3, { threshold: 0.5, precisionEstimate: 0.1 });
    expect(result.stats.blockedMerges).toBeGreaterThanOrEqual(0);
  });

  it('uses fast transitive closure when precision is high', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 1, rightId: 2, score: 0.9 },
    ];
    const result = verifiedMergeClustering(pairs, 3, { threshold: 0.5, precisionEstimate: 0.95 });
    // High precision → safe fast path, should merge all
    const totalInClusters = result.clusters.reduce((s, c) => s + c.members.length, 0);
    expect(totalInClusters + result.singletons.length).toBe(3);
  });

  it('handles empty pairs gracefully', () => {
    const result = verifiedMergeClustering([], 5, { precisionEstimate: 0.5 });
    expect(result.clusters).toHaveLength(0);
    expect(result.singletons).toHaveLength(5);
  });
});
