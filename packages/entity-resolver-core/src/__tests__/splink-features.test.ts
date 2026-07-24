/**
 * Tests for Splink-compatible features: EM sampling, graph metrics, composable blocking.
 */
import { describe, it, expect } from 'vitest';
import type { ScoredPair } from '../types/core.js';

// ═══════════════════════════════════════════════════════════════
// EM Sampling
// ═══════════════════════════════════════════════════════════════

describe('EM max_pairs sampling', () => {
  it('maxPairs reduces pair count without breaking estimation', async () => {
    const { estimateParameters } = await import('../fellegi-sunter/em.js');
    const vectors = Array.from({ length: 200 }, () => [
      { field: 'name', level: 'exact_match' as const, value: 1, score: 1 },
    ]);
    const result = estimateParameters(vectors, { maxPairs: 50 });
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.parameters.mProbabilities.size).toBeGreaterThan(0);
  });

  it('handles maxPairs > total pairs (no-op)', async () => {
    const { estimateParameters } = await import('../fellegi-sunter/em.js');
    const vectors = [
      [{ field: 'name', level: 'exact_match' as const, value: 1, score: 1 }],
      [{ field: 'name', level: 'strong_match' as const, value: 0.8, score: 0.8 }],
    ];
    const result = estimateParameters(vectors, { maxPairs: 999 });
    expect(result.iterations).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Graph Metrics
// ═══════════════════════════════════════════════════════════════

describe('computeGraphMetrics', () => {
  it('computes metrics for simple two-node cluster', async () => {
    const { computeGraphMetrics } = await import('../clustering/graph-metrics.js');
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9, probability: 0.9 },
    ];
    const clusters = new Map([['c1', { memberIds: [0, 1], cohesion: 0.9 }]]);
    const metrics = computeGraphMetrics(pairs, clusters, 3);
    expect(metrics.totalEntities).toBe(3);
    expect(metrics.clusters.length).toBe(1);
    expect(metrics.clusters[0]!.size).toBe(2);
    expect(metrics.clusters[0]!.density).toBe(1);
    expect(metrics.clusters[0]!.isConnected).toBe(true);
    expect(metrics.singletonCount).toBe(1);
  });

  it('node degree reflects adjacency', async () => {
    const { computeGraphMetrics } = await import('../clustering/graph-metrics.js');
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 0, rightId: 2, score: 0.8 },
      { leftId: 1, rightId: 2, score: 0.7 },
    ];
    const clusters = new Map([['c1', { memberIds: [0, 1, 2], cohesion: 0.8 }]]);
    const metrics = computeGraphMetrics(pairs, clusters, 3);
    expect(metrics.nodes[0]!.degree).toBe(2);
    expect(metrics.maxClusterSize).toBe(3);
  });

  it('detects disconnected cluster', async () => {
    const { computeGraphMetrics } = await import('../clustering/graph-metrics.js');
    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.9 }];
    const clusters = new Map([['c1', { memberIds: [0, 1, 2], cohesion: 0 }]]);
    const metrics = computeGraphMetrics(pairs, clusters, 3);
    expect(metrics.clusters[0]!.isConnected).toBe(false);
  });

  it('empty clusters produce valid output', async () => {
    const { computeGraphMetrics } = await import('../clustering/graph-metrics.js');
    const metrics = computeGraphMetrics([], new Map(), 5);
    expect(metrics.totalEntities).toBe(5);
    expect(metrics.singletonCount).toBe(5);
  });
});

describe('detectBridges', () => {
  it('chain has bridges', async () => {
    const { detectBridges } = await import('../clustering/graph-metrics.js');
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 1, rightId: 2, score: 0.8 },
    ];
    const bridges = detectBridges(pairs, { memberIds: [0, 1, 2] });
    expect(bridges.length).toBe(2);
  });

  it('triangle has no bridges', async () => {
    const { detectBridges } = await import('../clustering/graph-metrics.js');
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9 },
      { leftId: 0, rightId: 2, score: 0.8 },
      { leftId: 1, rightId: 2, score: 0.7 },
    ];
    const bridges = detectBridges(pairs, { memberIds: [0, 1, 2] });
    expect(bridges.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Composable Blocking
// ═══════════════════════════════════════════════════════════════

describe('composable blocking', () => {
  const makeResult = (prs: [number, number][], total: number) => ({
    pairs: prs.map(([l, r]) => ({ leftId: l, rightId: r })),
    blockCount: 1,
    totalRecords: total,
    reductionRatio: 1 - prs.length / (total * (total - 1) / 2),
  });

  it('blockOnField creates blocking pass', async () => {
    const { blockOnField } = await import('../blocking/composable.js');
    const pass = blockOnField('name', ['lowercase']);
    expect(pass.fields).toEqual(['name']);
    expect(pass.transforms).toContain('lowercase');
  });

  it('blockOnAll creates multi-field pass', async () => {
    const { blockOnAll } = await import('../blocking/composable.js');
    const pass = blockOnAll(['first_name', 'surname']);
    expect(pass.fields).toEqual(['first_name', 'surname']);
  });

  it('intersect keeps common pairs only', async () => {
    const { intersectPairs } = await import('../blocking/composable.js');
    const r1 = makeResult([[0, 1], [0, 2]], 4);
    const r2 = makeResult([[0, 1], [1, 2]], 4);
    const result = intersectPairs([r1, r2]);
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0]!.leftId).toBe(0);
    expect(result.pairs[0]!.rightId).toBe(1);
  });

  it('union merges unique pairs', async () => {
    const { unionPairs } = await import('../blocking/composable.js');
    const r1 = makeResult([[0, 1]], 4);
    const r2 = makeResult([[1, 2]], 4);
    const result = unionPairs([r1, r2]);
    expect(result.pairs.length).toBe(2);
  });

  it('union deduplicates', async () => {
    const { unionPairs } = await import('../blocking/composable.js');
    const r1 = makeResult([[0, 1]], 4);
    const r2 = makeResult([[0, 1]], 4);
    const result = unionPairs([r1, r2]);
    expect(result.pairs.length).toBe(1);
  });

  it('subtract removes pairs', async () => {
    const { subtractPairs } = await import('../blocking/composable.js');
    const r1 = makeResult([[0, 1], [0, 2]], 4);
    const r2 = makeResult([[0, 1]], 4);
    const result = subtractPairs(r1, [r2]);
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0]!.leftId).toBe(0);
    expect(result.pairs[0]!.rightId).toBe(2);
  });
});
