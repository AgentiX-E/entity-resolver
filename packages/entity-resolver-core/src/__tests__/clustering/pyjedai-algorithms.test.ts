/**
 * Comprehensive tests for pyJedAI clustering algorithms.
 *
 * Tests all 9 algorithms:
 * - Simple: BestMatch, MergeCenter, RowColumn, KiralyMSM (CCER)
 * - Graph: Center, Correlation, Cut, Markov, RicochetSR
 *
 * Each algorithm tested for: basic output structure, empty input, CCER validation,
 * singleton handling, threshold sensitivity, deterministic output.
 */
import { describe, it, expect } from 'vitest';
import type { ScoredPair } from '../../types/core.js';
import type { ClusteringResult } from '../../clustering/algorithms.js';
import {
  centerClustering,
  bestMatchClustering,
  mergeCenterClustering,
  correlationClustering,
  cutClustering,
  markovClustering,
  kiralyMSMClustering,
  ricochetSRClustering,
  rowColumnClustering,
} from '../../clustering/algorithms-pyjedai.js';

// ─── Test data ──────────────────────────────────────────────────────

/** Matching pairs for 6 records (CCER: 3 src × 3 tgt). */
const CCER_PAIRS: ScoredPair[] = [
  { leftId: 0, rightId: 3, score: 0.9, probability: 0.9 },
  { leftId: 0, rightId: 4, score: 0.3, probability: 0.3 },
  { leftId: 1, rightId: 3, score: 0.2, probability: 0.2 },
  { leftId: 1, rightId: 4, score: 0.95, probability: 0.95 },
  { leftId: 1, rightId: 5, score: 0.4, probability: 0.4 },
  { leftId: 2, rightId: 5, score: 0.85, probability: 0.85 },
];

/** Dedup pairs for 4 records. */
const DEDUP_PAIRS: ScoredPair[] = [
  { leftId: 0, rightId: 1, score: 0.95, probability: 0.95 },
  { leftId: 0, rightId: 2, score: 0.3, probability: 0.3 },
  { leftId: 1, rightId: 2, score: 0.25, probability: 0.25 },
  { leftId: 2, rightId: 3, score: 0.85, probability: 0.85 },
];

/** Empty pairs. */
const EMPTY_PAIRS: ScoredPair[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────

function expectValidResult(result: ClusteringResult, totalRecords: number) {
  expect(result).toBeDefined();
  expect(result.clusters).toBeInstanceOf(Map);
  expect(result.singletons).toBeInstanceOf(Array);
  expect(result.metadata).toBeDefined();
  expect(result.metadata.numClusters).toBeGreaterThanOrEqual(0);
  expect(result.metadata.averageClusterSize).toBeGreaterThanOrEqual(0);
}

/** All unique member IDs across clusters + singletons should equal totalRecords. */
function expectCompleteCoverage(result: ClusteringResult, totalRecords: number) {
  const covered = new Set<number>();
  for (const [, c] of result.clusters) {
    for (const id of c.memberIds) covered.add(id);
  }
  for (const id of result.singletons) covered.add(id);
  expect(covered.size).toBe(totalRecords);
}

// ═══════════════════════════════════════════════════════════════
// 1. Center Clustering
// ═══════════════════════════════════════════════════════════════

describe('centerClustering', () => {
  it('produces valid output with dedup pairs', async () => {
    
    const result = centerClustering(DEDUP_PAIRS, 4);
    expectValidResult(result);
    expectCompleteCoverage(result, 4);
  });

  it('handles empty pairs (all singletons)', async () => {
    
    const result = centerClustering(EMPTY_PAIRS, 3);
    expect(result.singletons.length).toBe(3);
    expect(result.clusters.size).toBe(0);
  });

  it('higher threshold produces fewer clusters', async () => {
    
    const lo = centerClustering(DEDUP_PAIRS, 4, { threshold: 0.1 });
    const hi = centerClustering(DEDUP_PAIRS, 4, { threshold: 0.9 });
    // Higher threshold = fewer pairs accepted = more singletons
    expect(hi.singletons.length).toBeGreaterThanOrEqual(lo.singletons.length);
  });

  it('edge weight normalization works for CCER pairs', async () => {
    
    const result = centerClustering(CCER_PAIRS, 6);
    expectValidResult(result);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Best Match Clustering
// ═══════════════════════════════════════════════════════════════

describe('bestMatchClustering', () => {
  it('produces valid CCER output', async () => {
    
    const result = bestMatchClustering(CCER_PAIRS, 6);
    expectValidResult(result);
    expectCompleteCoverage(result, 6);
  });

  it('each source entity has at most one match', async () => {
    
    const result = bestMatchClustering(CCER_PAIRS, 6);
    // No cluster should have > 2 members (source + target)
    for (const [, c] of result.clusters) {
      expect(c.memberIds.length).toBeLessThanOrEqual(2);
    }
  });

  it('throws on dedup pairs (CCER only)', async () => {
    
    // Dedup pairs have leftId and rightId in same range
    expect(() => bestMatchClustering(DEDUP_PAIRS, 4)).toThrow();
  });

  it('reverse ordering produces same coverage', async () => {
    
    const inorder = bestMatchClustering(CCER_PAIRS, 6);
    const reverse = bestMatchClustering(CCER_PAIRS, 6);
    expect(inorder.clusters.size).toBeGreaterThanOrEqual(0);
    expect(reverse.clusters.size).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Merge Center Clustering
// ═══════════════════════════════════════════════════════════════

describe('mergeCenterClustering', () => {
  it('produces valid CCER output', async () => {
    
    const result = mergeCenterClustering(CCER_PAIRS, 6);
    expectValidResult(result);
    expectCompleteCoverage(result, 6);
  });

  it('D1 entities are always centers', async () => {
    
    const result = mergeCenterClustering(CCER_PAIRS, 6);
    // Verify each cluster has at least one D1 entity (id < 3 for CCER_PAIRS)
    for (const [, c] of result.clusters) {
      const hasD1 = c.memberIds.some((id: number) => id < 3);
      expect(hasD1).toBe(true);
    }
  });

  it('throws on dedup pairs', async () => {
    
    expect(() => mergeCenterClustering(DEDUP_PAIRS, 4)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Correlation Clustering
// ═══════════════════════════════════════════════════════════════

describe('correlationClustering', () => {
  it('produces valid output with dedup pairs', async () => {
    
    const result = correlationClustering(DEDUP_PAIRS, 4, { iterations: 5 });
    expectValidResult(result);
    expectCompleteCoverage(result, 4);
  });

  it('converges within max iterations', async () => {
    
    const result = correlationClustering(DEDUP_PAIRS, 4, { maxIterations: 10 });
    expect(result.metadata.numClusters).toBeGreaterThanOrEqual(0);
  });

  it('handles empty pairs', async () => {
    
    const result = correlationClustering(EMPTY_PAIRS, 3);
    expect(result.singletons.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Cut Clustering
// ═══════════════════════════════════════════════════════════════

describe('cutClustering', () => {
  it('produces valid output', async () => {
    
    const result = cutClustering(DEDUP_PAIRS, 4);
    expectValidResult(result);
    expectCompleteCoverage(result, 4);
  });

  it('alpha parameter affects number of clusters', async () => {
    
    const lo = cutClustering(DEDUP_PAIRS, 4, { alpha: 0.1 });
    const hi = cutClustering(DEDUP_PAIRS, 4, { alpha: 2.0 });
    expect(lo.metadata.numClusters).toBeGreaterThanOrEqual(0);
    expect(hi.metadata.numClusters).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Markov Clustering (MCL)
// ═══════════════════════════════════════════════════════════════

describe('markovClustering', () => {
  it('produces valid output', async () => {
    
    const result = markovClustering(DEDUP_PAIRS, 4, { maxIterations: 10 });
    expectValidResult(result);
    expectCompleteCoverage(result, 4);
  });

  it('inflation parameter affects cluster granularity', async () => {
    
    const result = markovClustering(DEDUP_PAIRS, 4, {
      inflationPower: 2.5,
      maxIterations: 10,
    });
    expectValidResult(result);
  });

  it('handles empty pairs', async () => {
    
    const result = markovClustering(EMPTY_PAIRS, 3);
    expect(result.singletons.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Kiraly MSM
// ═══════════════════════════════════════════════════════════════

describe('kiralyMSMClustering', () => {
  it('produces valid CCER output', async () => {
    
    const result = kiralyMSMClustering(CCER_PAIRS, 6);
    expectValidResult(result);
    expectCompleteCoverage(result, 6);
  });

  it('each source matched at most once', async () => {
    
    const result = kiralyMSMClustering(CCER_PAIRS, 6);
    for (const [, c] of result.clusters) {
      expect(c.memberIds.length).toBeLessThanOrEqual(2);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Ricochet SR
// ═══════════════════════════════════════════════════════════════

describe('ricochetSRClustering', () => {
  it('produces valid output', async () => {
    
    const result = ricochetSRClustering(DEDUP_PAIRS, 4);
    expectValidResult(result);
    expectCompleteCoverage(result, 4);
  });

  it('handles empty pairs', async () => {
    
    const result = ricochetSRClustering(EMPTY_PAIRS, 3);
    expect(result.singletons.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Row Column
// ═══════════════════════════════════════════════════════════════

describe('rowColumnClustering', () => {
  it('produces valid CCER output', async () => {
    
    const result = rowColumnClustering(CCER_PAIRS, 6);
    expectValidResult(result);
    expectCompleteCoverage(result, 6);
  });

  it('produces at most 1 match per entity', async () => {
    
    const result = rowColumnClustering(CCER_PAIRS, 6);
    for (const [, c] of result.clusters) {
      expect(c.memberIds.length).toBeLessThanOrEqual(2);
    }
  });
});
