// Tests for all 12 evaluation metrics.

import { describe, it, expect } from 'vitest';
import { evaluateClustering } from '../../index.js';
import type { Cluster } from '../../types/core.js';

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
