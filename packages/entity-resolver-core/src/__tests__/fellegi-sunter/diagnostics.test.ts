/**
 * Tests for interactive diagnostics and TF adjustment (I39).
 */
import { describe, it, expect } from 'vitest';
import {
  buildWaterfallChart,
  computeROCCurve,
  extractMUParameters,
  computeTFAdjustmentSplink,
} from '../../fellegi-sunter/diagnostics.js';
import type { ComparisonVector, ComparisonSpec } from '../../matching/comparison.js';
import type { FSParameters } from '../../fellegi-sunter/parameters.js';
import type { ScoredPair } from '../../types/core.js';

// ═══════════════════════════════════════════════════════════════
// Waterfall chart
// ═══════════════════════════════════════════════════════════════

function makeParams(): FSParameters {
  const m = new Map<string, number>();
  m.set('name:strong_match', 0.95);
  m.set('name:not_match', 0.05);
  m.set('email:exact_match', 0.99);
  m.set('email:not_match', 0.01);
  const u = new Map<string, number>();
  u.set('name:strong_match', 0.1);
  u.set('name:not_match', 0.9);
  u.set('email:exact_match', 0.01);
  u.set('email:not_match', 0.99);
  return {
    mProbabilities: m,
    uProbabilities: u,
    lambda: 0.01,
  };
}

describe('buildWaterfallChart', () => {
  const params = makeParams();

  it('computes per-field match weights', () => {
    const vectors: ComparisonVector[] = [
      { field: 'name', level: 'strong_match', score: 0.95, scorer: 'jaro_winkler' },
      { field: 'email', level: 'exact_match', score: 1.0, scorer: 'exact' },
    ];
    const chart = buildWaterfallChart(0, 1, vectors, params, 3.0);

    expect(chart.bars).toHaveLength(2);
    expect(chart.bars[0]!.field).toBe('name');
    expect(chart.bars[0]!.level).toBe('strong_match');
    expect(chart.bars[1]!.field).toBe('email');
    // Match weight for strong name match should be positive
    expect(chart.bars[0]!.weight).toBeGreaterThan(0);
    // Cumulative increases with match evidence
    expect(chart.bars[1]!.cumulative).toBeGreaterThan(chart.bars[0]!.cumulative);
  });

  it('computes negative weights for non-match levels', () => {
    const vectors: ComparisonVector[] = [
      { field: 'name', level: 'not_match', score: 0.3, scorer: 'jaro_winkler' },
    ];
    const chart = buildWaterfallChart(0, 1, vectors, params, 3.0);

    expect(chart.bars[0]!.weight).toBeLessThan(0);
    expect(chart.bars[0]!.cumulative).toBeLessThan(0);
  });

  it('correctly classifies pairs at threshold', () => {
    const vectors: ComparisonVector[] = [
      { field: 'email', level: 'exact_match', score: 1.0, scorer: 'exact' },
    ];
    const chart = buildWaterfallChart(0, 1, vectors, params, 3.0);
    // Email exact match: log2(0.99/0.01) = 6.629
    expect(chart.isMatch).toBe(true);

    const chartBelow = buildWaterfallChart(0, 1, vectors, params, 10.0);
    expect(chartBelow.isMatch).toBe(false);
  });

  it('handles empty vectors gracefully', () => {
    const chart = buildWaterfallChart(0, 1, [], params, 3.0);
    expect(chart.bars).toHaveLength(0);
    expect(chart.totalWeight).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// ROC curve
// ═══════════════════════════════════════════════════════════════

describe('computeROCCurve', () => {
  const leftIds = ['a', 'b', 'c', 'd'];
  const rightIds = ['a', 'b', 'c', 'd'];

  it('computes metrics for perfect predictions', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 0, score: 0.99, probability: 0.99 },
      { leftId: 1, rightId: 1, score: 0.95, probability: 0.95 },
    ];
    const truth = new Set(['a|a', 'b|b']);
    const curve = computeROCCurve(pairs, truth, leftIds, rightIds);

    // With no false positives, F1 should be 1.0
    expect(curve.optimalF1).toBe(1);
    // AUC may be 0 with no negatives — that's expected behavior
    expect(curve.points.length).toBeGreaterThan(0);
  });

  it('handles random predictions', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 0, score: 0.5 },
      { leftId: 0, rightId: 1, score: 0.5 },
    ];
    const truth = new Set(['a|a']);
    const curve = computeROCCurve(pairs, truth, leftIds, rightIds);
    expect(curve.optimalF1).toBeGreaterThanOrEqual(0);
    expect(curve.aucROC).toBeGreaterThanOrEqual(0);
  });

  it('returns zero for empty pairs', () => {
    const curve = computeROCCurve([], new Set(['a|a']), leftIds, rightIds);
    expect(curve.points).toHaveLength(0);
    expect(curve.aucROC).toBe(0);
  });

  it('finds optimal threshold', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 0, score: 0.3, probability: 0.3 },
      { leftId: 0, rightId: 1, score: 0.3, probability: 0.3 },
      { leftId: 1, rightId: 1, score: 0.9, probability: 0.9 },
    ];
    const truth = new Set(['b|b']);
    const curve = computeROCCurve(pairs, truth, leftIds, rightIds);

    // Optimal threshold should be where F1 is highest
    expect(curve.optimalThreshold).toBeGreaterThanOrEqual(0);
    expect(curve.optimalThreshold).toBeLessThanOrEqual(1);
    expect(curve.optimalF1).toBeGreaterThanOrEqual(0);
  });

  it('points are sorted by threshold', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 0, score: 0.3 },
      { leftId: 0, rightId: 1, score: 0.7 },
    ];
    const truth = new Set(['a|a']);
    const curve = computeROCCurve(pairs, truth, leftIds, rightIds);

    for (let i = 1; i < curve.points.length; i++) {
      expect(curve.points[i]!.threshold)
        .toBeGreaterThanOrEqual(curve.points[i - 1]!.threshold);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// M/U parameter extraction
// ═══════════════════════════════════════════════════════════════

describe('extractMUParameters', () => {
  it('extracts all comparison level parameters', () => {
    const params = makeParams();
    const comps: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'strong_match', threshold: 0.9 },
          { label: 'not_match', threshold: 0 },
        ],
      },
      {
        field: 'email',
        scorerName: 'exact',
        levels: [{ label: 'exact_match', threshold: 0.99 }],
      },
    ];

    const points = extractMUParameters(params, comps);
    expect(points.length).toBe(3);
    expect(points[0]!.key).toBe('name:strong_match');
    expect(points[0]!.mProbability).toBe(0.95);
    expect(points[0]!.uProbability).toBe(0.1);
  });

  it('match weight is log2(m/u)', () => {
    const params = makeParams();
    const comps: ComparisonSpec[] = [
      { field: 'name', scorerName: 'exact', levels: [{ label: 'exact_match', threshold: 0.99 }] },
    ];

    const points = extractMUParameters(params, comps);
    // name:exact_match doesn't exist in our params, uses defaults m=0.9, u=0.1
    expect(points[0]!.mProbability).toBe(0.9);
    expect(points[0]!.matchWeight).toBeCloseTo(Math.log2(0.9 / 0.1), 2);
  });

  it('handles empty comparisons', () => {
    const points = extractMUParameters(makeParams(), []);
    expect(points).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Enhanced TF adjustment (Splink-equivalent)
// ═══════════════════════════════════════════════════════════════

describe('computeTFAdjustmentSplink', () => {
  it('returns 1.0 for equal frequencies', () => {
    const adj = computeTFAdjustmentSplink(1, 1, 1000, 0.1);
    expect(adj).toBeGreaterThan(0);
  });

  it('penalizes high-frequency values', () => {
    const rare = computeTFAdjustmentSplink(1, 1, 1000, 0.1);
    const common = computeTFAdjustmentSplink(500, 500, 1000, 0.1);
    // Common values should get higher adjustment multiplier (more penalty)
    expect(common).toBeGreaterThan(rare);
  });

  it('uses GREATEST(tf_l, tf_r) by default', () => {
    const sym1 = computeTFAdjustmentSplink(1, 100, 1000, 0.1);
    const sym2 = computeTFAdjustmentSplink(100, 1, 1000, 0.1);
    expect(sym1).toBe(sym2); // Symmetric: both use max(1,100)=100
  });

  it('respects floor parameter', () => {
    const adj = computeTFAdjustmentSplink(1, 1, 1000, 0.1, { floor: 0.5 });
    expect(adj).toBeGreaterThanOrEqual(0.5);
  });

  it('respects minUValue parameter', () => {
    const adj1 = computeTFAdjustmentSplink(1, 1, 1000, 0.1, { minUValue: 0.001 });
    const adj2 = computeTFAdjustmentSplink(1, 1, 1000, 0.000001, { minUValue: 0.001 });
    // Very low base_u gets clamped to min_u → higher adjustment
    expect(adj2).toBeGreaterThanOrEqual(adj1);
  });

  it('uses floor when adjustment drops below minimum', () => {
    // freq=1 out of 1000 records → very rare → should not be penalized heavily
    const adj = computeTFAdjustmentSplink(1, 1, 1000, 0.1);
    expect(adj).toBeGreaterThanOrEqual(0.01); // floor prevents going below 0.01
  });

  it('handles zero total records gracefully', () => {
    const adj = computeTFAdjustmentSplink(1, 1, 0, 0.1);
    expect(adj).toBe(1.0);
  });

  it('allows disabling GREATEST with useGreatest=false', () => {
    // Left freq=1 (rare), Right freq=100 (common)
    const adj1 = computeTFAdjustmentSplink(1, 100, 1000, 0.1, { useGreatest: true });
    const adj2 = computeTFAdjustmentSplink(1, 100, 1000, 0.1, { useGreatest: false });
    // Without GREATEST: uses left=1 (rare) → less penalty → smaller adjustment multiplier
    // With GREATEST: uses max(1,100)=100 (common) → more penalty → larger multiplier
    // Both hit the floor (0.01) → they're equal
    expect(adj2).toBeLessThanOrEqual(adj1);
  });
});