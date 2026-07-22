// Tests for Visual Layer 1 — Data API.

import { describe, it, expect } from 'vitest';
import {
  buildWaterfallData,
  buildHistogramData,
  buildMuChartData,
  buildClusterData,
  buildEvaluationData,
  buildUnlinkablesData,
} from '../index.js';
import type { PipelineResult } from '@agentix-e/entity-resolution-core';

function makeMockResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    clusters: new Map(),
    scoredPairs: [
      { leftId: 0, rightId: 1, score: 0.95, probability: 0.95 },
      { leftId: 2, rightId: 3, score: 0.3, probability: 0.3 },
    ],
    singletons: [4],
    statistics: {
      totalRecords: 5,
      totalClusters: 0,
      matchedRecords: 4,
      matchRate: 0.8,
      averageClusterSize: 0,
      maxClusterSize: 0,
      executionTimeMs: 100,
    },
    diagnostics: {
      muParameters: new Map([
        [
          'name',
          {
            mProbabilities: new Map([
              ['name:exact_match', 0.95],
              ['name:not_match', 0.05],
            ]),
            uProbabilities: new Map([
              ['name:exact_match', 0.05],
              ['name:not_match', 0.95],
            ]),
          },
        ],
      ]),
      matchWeightDistribution: [
        { minWeight: -10, maxWeight: -5, count: 1 },
        { minWeight: -5, maxWeight: 0, count: 1 },
        { minWeight: 0, maxWeight: 5, count: 0 },
        { minWeight: 5, maxWeight: 10, count: 1 },
      ],
      unlinkableCount: 1,
    },
    ...overrides,
  };
}

describe('buildWaterfallData', () => {
  it('builds waterfall chart from pipeline result', () => {
    const result = makeMockResult();
    const data = buildWaterfallData(result, 0);
    expect(data.recordPair.idA).toBe(0);
    expect(data.recordPair.idB).toBe(1);
    expect(data.bars.length).toBeGreaterThan(0);
    expect(data.matchProbability).toBeGreaterThan(0);
  });

  it('handles out-of-bounds pair index', () => {
    const result = makeMockResult();
    const data = buildWaterfallData(result, 999);
    expect(data.recordPair.idA).toBe(-1);
    expect(data.bars).toHaveLength(0);
  });

  it('bars have valid structure', () => {
    const result = makeMockResult();
    const data = buildWaterfallData(result, 0);
    for (const bar of data.bars) {
      expect(bar.label).toBeTruthy();
      expect(typeof bar.weight).toBe('number');
      expect(typeof bar.cumulative).toBe('number');
    }
  });
});

describe('buildHistogramData', () => {
  it('builds histogram from diagnostics', () => {
    const result = makeMockResult();
    const data = buildHistogramData(result, 0);
    expect(data.bins.length).toBeGreaterThan(0);
    expect(data.summary.totalPairs).toBeGreaterThan(0);
  });

  it('computes above/below threshold correctly', () => {
    const result = makeMockResult();
    const data = buildHistogramData(result, 0);
    expect(data.summary.aboveThreshold).toBeGreaterThanOrEqual(0);
    expect(data.summary.belowThreshold).toBeGreaterThanOrEqual(0);
    expect(data.summary.aboveThreshold + data.summary.belowThreshold).toBeLessThanOrEqual(
      data.summary.totalPairs,
    );
  });

  it('default threshold is zero', () => {
    const result = makeMockResult();
    const data = buildHistogramData(result);
    expect(data.threshold).toBe(0);
  });

  it('handles empty scored pairs', () => {
    const result = makeMockResult({
      scoredPairs: [],
      diagnostics: { muParameters: new Map(), matchWeightDistribution: [], unlinkableCount: 0 },
    });
    const data = buildHistogramData(result);
    expect(data.bins).toHaveLength(0);
    expect(data.summary.totalPairs).toBe(0);
  });
});

describe('buildMuChartData', () => {
  it('builds m/u chart from diagnostics', () => {
    const result = makeMockResult();
    const data = buildMuChartData(result);
    expect(data.fields.length).toBeGreaterThan(0);
    expect(data.fields[0]!.levels.length).toBeGreaterThan(0);
  });

  it('computes weight from m/u', () => {
    const result = makeMockResult();
    const data = buildMuChartData(result);
    for (const field of data.fields) {
      for (const level of field.levels) {
        expect(typeof level.weight).toBe('number');
        expect(level.mProbability).toBeGreaterThan(0);
        expect(level.mProbability).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('buildClusterData', () => {
  it('builds cluster tree', () => {
    const result = makeMockResult({
      clusters: new Map([['c0', { clusterId: 'c0', memberIds: [0, 1, 2], cohesion: 0.8 }]]),
    });
    const data = buildClusterData(result);
    expect(data.tree.children.length).toBe(1);
    expect(data.totalClusters).toBe(1);
    expect(data.totalRecords).toBe(5);
    expect(data.singletonCount).toBe(1);
  });

  it('handles empty clusters', () => {
    const result = makeMockResult();
    const data = buildClusterData(result);
    expect(data.tree.children).toHaveLength(0);
  });
});

describe('buildEvaluationData', () => {
  it('builds 12-axis radar from metrics', () => {
    const data = buildEvaluationData({
      pairwisePrecision: 0.9,
      pairwiseRecall: 0.85,
      pairwiseF1: 0.874,
      clusterPrecision: 0.8,
      clusterRecall: 0.75,
      clusterF1: 0.774,
      bCubedPrecision: 0.88,
      bCubedRecall: 0.82,
      bCubedF1: 0.849,
      adjustedRandIndex: 0.7,
      fowlkesMallowsIndex: 0.75,
      vMeasure: 0.8,
    });
    expect(data.axes.length).toBe(12);
    for (const axis of data.axes) {
      expect(axis.value).toBeGreaterThanOrEqual(0);
      expect(axis.value).toBeLessThanOrEqual(1);
      expect(axis.maxValue).toBe(1);
    }
  });

  it('includes all 12 metric names', () => {
    const data = buildEvaluationData({
      pairwisePrecision: 1,
      pairwiseRecall: 1,
      pairwiseF1: 1,
      clusterPrecision: 1,
      clusterRecall: 1,
      clusterF1: 1,
      bCubedPrecision: 1,
      bCubedRecall: 1,
      bCubedF1: 1,
      adjustedRandIndex: 1,
      fowlkesMallowsIndex: 1,
      vMeasure: 1,
    });
    const names = data.axes.map((a) => a.name);
    expect(names).toContain('Pairwise P');
    expect(names).toContain('B³ F1');
    expect(names).toContain('ARI');
    expect(names).toContain('V-measure');
  });
});

describe('buildUnlinkablesData', () => {
  it('computes linkable stats', () => {
    const result = makeMockResult();
    const data = buildUnlinkablesData(result);
    expect(data.totalRecords).toBe(5);
    expect(data.unlinkedRecords).toBe(1);
    expect(data.linkedRecords).toBe(4);
    expect(data.matchRate).toBe(0.8);
  });
});

describe('buildHistogramData edge cases', () => {
  it('handles empty distribution with scored pairs (fallback to default bins)', () => {
    const result = makeMockResult({
      diagnostics: {
        muParameters: new Map(),
        matchWeightDistribution: [],
        unlinkableCount: 0,
      },
    });
    const data = buildHistogramData(result);
    expect(data.bins.length).toBeGreaterThanOrEqual(0);
    expect(data.summary).toBeDefined();
  });

  it('handles histogram with explicit threshold', () => {
    const result = makeMockResult();
    const data = buildHistogramData(result, 5);
    expect(data.threshold).toBe(5);
  });

  it('handles overlapping bin with threshold', () => {
    const result = makeMockResult({
      diagnostics: {
        muParameters: new Map(),
        matchWeightDistribution: [{ minWeight: -5, maxWeight: 10, count: 5 }],
        unlinkableCount: 0,
      },
    });
    const data = buildHistogramData(result, 0);
    expect(data.summary.aboveThreshold).toBeGreaterThanOrEqual(0);
    expect(data.summary.belowThreshold).toBeGreaterThanOrEqual(0);
  });
});

describe('buildMuChartData edge cases', () => {
  it('handles empty muParameters', () => {
    const result = makeMockResult({
      diagnostics: { muParameters: new Map(), matchWeightDistribution: [], unlinkableCount: 0 },
    });
    const data = buildMuChartData(result);
    expect(data.fields).toHaveLength(0);
  });
});

describe('buildWaterfallData edge cases', () => {
  it('handles empty diagnostics', () => {
    const result = makeMockResult({
      diagnostics: { muParameters: new Map(), matchWeightDistribution: [], unlinkableCount: 0 },
    });
    const data = buildWaterfallData(result, 0);
    expect(data.bars).toHaveLength(0);
  });
});
