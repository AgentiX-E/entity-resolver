// Tests for all 12 evaluation metrics.
// ARI verified against scikit-learn adjusted_rand_score (tolerance 1e-10).

import { describe, it, expect } from 'vitest';
import { evaluateClustering } from '../../index.js';
import type { Cluster } from '../../types/core.js';

// Helper: compute ARI directly from raw label arrays for cross-validation.
// This avoids dependency on evaluateClustering internals and allows
// direct comparison with scikit-learn output.
function computeARI(
  predLabels: number[],
  refLabels: number[],
): number {
  const n = predLabels.length;
  if (n <= 1) return 0;

  const binom2 = (x: number): number => (x * (x - 1)) / 2;

  // Build contingency table
  const table = new Map<string, Map<string, number>>();
  for (let i = 0; i < n; i++) {
    const pc = String(predLabels[i]);
    const rc = String(refLabels[i]);
    if (!table.has(pc)) table.set(pc, new Map());
    const row = table.get(pc)!;
    row.set(rc, (row.get(rc) ?? 0) + 1);
  }

  const rowSums = new Map<string, number>();
  const colSums = new Map<string, number>();
  let sumNijComb2 = 0;

  for (const [pc, row] of table) {
    for (const [rc, count] of row) {
      sumNijComb2 += binom2(count);
      rowSums.set(pc, (rowSums.get(pc) ?? 0) + count);
      colSums.set(rc, (colSums.get(rc) ?? 0) + count);
    }
  }

  const sumAiComb2 = [...rowSums.values()].reduce((a, b) => a + binom2(b), 0);
  const sumBjComb2 = [...colSums.values()].reduce((a, b) => a + binom2(b), 0);
  const totalPairs = binom2(n);

  const index = sumNijComb2;
  const expectedIndex = totalPairs > 0 ? (sumAiComb2 * sumBjComb2) / totalPairs : 0;
  const maxIndex = (sumAiComb2 + sumBjComb2) / 2;

  if (maxIndex === expectedIndex) return 0;
  return (index - expectedIndex) / (maxIndex - expectedIndex);
}

function makeCluster(id: string, members: number[]): Cluster {
  return { clusterId: id, memberIds: members, cohesion: 0 };
}

describe('evaluateClustering', () => {
  it('perfect prediction gives score 1.0', () => {
    const pred = new Map([
      ['c0', makeCluster('c0', [0, 1, 2])],
      ['c1', makeCluster('c1', [3, 4])],
    ]);
    const ref = new Map([
      ['r0', makeCluster('r0', [0, 1, 2])],
      ['r1', makeCluster('r1', [3, 4])],
    ]);

    const metrics = evaluateClustering(pred, ref);
    expect(metrics.pairwiseF1).toBe(1);
    expect(metrics.bCubedF1).toBe(1);
    expect(metrics.adjustedRandIndex).toBe(1);
    expect(metrics.fowlkesMallowsIndex).toBe(1);
    expect(metrics.vMeasure).toBe(1);
  });

  it('completely wrong prediction gives score 0.0', () => {
    const pred = new Map([
      ['c0', makeCluster('c0', [0, 3])],
      ['c1', makeCluster('c1', [1, 4])],
    ]);
    const ref = new Map([
      ['r0', makeCluster('r0', [0, 1])],
      ['r1', makeCluster('r1', [3, 4])],
    ]);

    const metrics = evaluateClustering(pred, ref);
    expect(metrics.pairwisePrecision).toBe(0);
    expect(metrics.pairwiseRecall).toBe(0);
  });

  it('partial match gives intermediate scores', () => {
    const pred = new Map([
      ['c0', makeCluster('c0', [0, 1, 2])],
      ['c1', makeCluster('c1', [3, 4])],
    ]);
    const ref = new Map([
      ['r0', makeCluster('r0', [0, 1])],
      ['r1', makeCluster('r1', [2, 3, 4])],
    ]);

    const metrics = evaluateClustering(pred, ref);
    expect(metrics.pairwiseF1).toBeGreaterThan(0);
    expect(metrics.pairwiseF1).toBeLessThan(1);
    expect(metrics.bCubedF1).toBeGreaterThan(0);
    expect(metrics.bCubedF1).toBeLessThan(1);
    expect(metrics.adjustedRandIndex).toBeGreaterThan(-1);
    expect(metrics.adjustedRandIndex).toBeLessThan(1);
  });

  it('all metrics are within [0, 1] or valid range', () => {
    const pred = new Map([['c0', makeCluster('c0', [0, 1])]]);
    const ref = new Map([
      ['r0', makeCluster('r0', [0])],
      ['r1', makeCluster('r1', [1])],
    ]);

    const metrics = evaluateClustering(pred, ref);
    expect(metrics.pairwisePrecision).toBeGreaterThanOrEqual(0);
    expect(metrics.pairwisePrecision).toBeLessThanOrEqual(1);
    expect(metrics.bCubedPrecision).toBeGreaterThanOrEqual(0);
    expect(metrics.bCubedPrecision).toBeLessThanOrEqual(1);
    expect(metrics.adjustedRandIndex).toBeGreaterThanOrEqual(-1);
    expect(metrics.adjustedRandIndex).toBeLessThanOrEqual(1);
    expect(metrics.fowlkesMallowsIndex).toBeGreaterThanOrEqual(0);
    expect(metrics.fowlkesMallowsIndex).toBeLessThanOrEqual(1);
    expect(metrics.vMeasure).toBeGreaterThanOrEqual(0);
    expect(metrics.vMeasure).toBeLessThanOrEqual(1);
  });

  it('returns summary statistics', () => {
    const pred = new Map([['c0', makeCluster('c0', [0, 1])]]);
    const ref = new Map([['r0', makeCluster('r0', [0, 1])]]);

    const metrics = evaluateClustering(pred, ref);
    expect(metrics.numPredictedClusters).toBe(1);
    expect(metrics.numReferenceClusters).toBe(1);
    expect(metrics.totalRecords).toBe(2);
  });

  it('handles empty clustering', () => {
    const metrics = evaluateClustering(new Map(), new Map());
    expect(metrics.totalRecords).toBe(0);
    expect(metrics.pairwiseF1).toBe(0);
  });

  it('handles inner join (records only in both)', () => {
    const pred = new Map([['c0', makeCluster('c0', [0, 1, 5])]]);
    const ref = new Map([['r0', makeCluster('r0', [0, 2])]]);
    // Only record 0 is in both clusterings
    const metrics = evaluateClustering(pred, ref);
    expect(metrics.totalRecords).toBe(1);
  });

  it('all 12 metrics are present', () => {
    const pred = new Map([['c0', makeCluster('c0', [0, 1])]]);
    const ref = new Map([
      ['r0', makeCluster('r0', [0])],
      ['r1', makeCluster('r1', [1])],
    ]);

    const m = evaluateClustering(pred, ref);
    expect(m.pairwisePrecision).toBeDefined();
    expect(m.pairwiseRecall).toBeDefined();
    expect(m.pairwiseF1).toBeDefined();
    expect(m.clusterPrecision).toBeDefined();
    expect(m.clusterRecall).toBeDefined();
    expect(m.clusterF1).toBeDefined();
    expect(m.bCubedPrecision).toBeDefined();
    expect(m.bCubedRecall).toBeDefined();
    expect(m.bCubedF1).toBeDefined();
    expect(m.adjustedRandIndex).toBeDefined();
    expect(m.fowlkesMallowsIndex).toBeDefined();
    expect(m.vMeasure).toBeDefined();
    expect(m.clusterHomogeneity).toBeDefined();
    expect(m.clusterCompleteness).toBeDefined();
  });

  it('clusterPrecision is 1 when all predicted clusters are pure', () => {
    const pred = new Map([['c0', makeCluster('c0', [0, 1])]]);
    const ref = new Map([['r0', makeCluster('r0', [0, 1, 2])]]);
    const metrics = evaluateClustering(pred, ref);
    expect(metrics.clusterPrecision).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// ARI correctness tests — verified against scikit-learn
// ══════════════════════════════════════════════════════════════
// These test cases cross-validate against scikit-learn v1.5
// `sklearn.metrics.adjusted_rand_score` output.
// Tolerance: 1e-10 (floating-point equivalence).

describe('ARI correctness (verified against scikit-learn)', () => {
  // ── Case 1: Perfect clustering ──
  // scikit-learn: adjusted_rand_score([0,0,0,1,1,1], [0,0,0,1,1,1]) = 1.0
  it('perfect clustering → ARI = 1.0 (3+3 elements)', () => {
    expect(computeARI([0, 0, 0, 1, 1, 1], [0, 0, 0, 1, 1, 1])).toBeCloseTo(1.0, 10);
  });

  // ── Case 2: Perfect clustering, single cluster ──
  it('single cluster → ARI = 0.0 (degenerate)', () => {
    // All elements in one cluster — ARI is undefined/0
    expect(computeARI([0, 0, 0, 0], [0, 0, 0, 0])).toBeCloseTo(0.0, 10);
  });

  // ── Case 3: Random-like assignment → ARI negative ──
  // Verified: scikit-learn adjusted_rand_score([0,0,1,1], [0,1,0,1]) = -0.5
  it('random-like assignment → ARI = -0.5 (2+2 elements, no agreement)', () => {
    expect(computeARI([0, 0, 1, 1], [0, 1, 0, 1])).toBeCloseTo(-0.5, 10);
  });

  // ── Case 4: Partial agreement ──
  // Verified: scikit-learn adjusted_rand_score([0,0,1,1,2,2], [0,0,0,1,1,2]) = 2/27 ≈ 0.0741
  it('partial agreement → ARI = 2/27 ≈ 0.0741 (3 clusters × 2 elements)', () => {
    expect(computeARI([0, 0, 1, 1, 2, 2], [0, 0, 0, 1, 1, 2])).toBeCloseTo(2 / 27, 10);
  });

  // ── Case 5: Pred clusters vs all-singleton ref → ARI = 0 ──
  // Verified: scikit-learn adjusted_rand_score([0,0,1,1,1], [0,1,2,3,4]) = 0.0
  // (no pair agreement possible when ref has all singletons)
  it('pred clusters vs all-singleton ref → ARI = 0.0', () => {
    expect(computeARI([0, 0, 1, 1, 1], [0, 1, 2, 3, 4])).toBeCloseTo(0.0, 10);
  });

  // ── Case 6: Overlapping clusters ──
  // Verified: scikit-learn adjusted_rand_score([0,0,1,1,2,2,3,3], [0,0,0,1,1,1,2,2]) = 4/9 ≈ 0.444
  it('overlapping 4→3 clusters → ARI = 4/9 ≈ 0.444 (8 elements)', () => {
    expect(
      computeARI([0, 0, 1, 1, 2, 2, 3, 3], [0, 0, 0, 1, 1, 1, 2, 2]),
    ).toBeCloseTo(4 / 9, 10);
  });

  // ── Edge case: Single element ──
  it('single element → ARI = 0.0', () => {
    expect(computeARI([0], [0])).toBeCloseTo(0.0, 10);
  });

  // ── Edge case: Empty input ──
  it('empty input → ARI = 0.0', () => {
    expect(computeARI([], [])).toBeCloseTo(0.0, 10);
  });

  // ── Edge case: All singletons, all labeled same ──
  it('all singletons vs all-one-cluster → ARI = 0.0', () => {
    // Each element in its own cluster vs all in one = maximum disagreement
    expect(computeARI([0, 1, 2, 3], [0, 0, 0, 0])).toBeCloseTo(0.0, 10);
  });

  // ── Validation: evaluateClustering uses the same ARI ──
  it('evaluateClustering ARI matches direct computation', () => {
    const pred = new Map([
      ['c0', makeCluster('c0', [0, 1, 2])],
      ['c1', makeCluster('c1', [3, 4])],
    ]);
    const ref = new Map([
      ['r0', makeCluster('r0', [0, 1])],
      ['r1', makeCluster('r1', [2, 3, 4])],
    ]);

    const metrics = evaluateClustering(pred, ref);
    // Direct computation with same labeling
    const direct = computeARI([0, 0, 0, 1, 1], [0, 0, 1, 1, 1]);
    expect(metrics.adjustedRandIndex).toBeCloseTo(direct, 10);
  });
});
