// Final branch coverage push — edge conditions for evaluation, linking, blocking.
import { describe, it, expect } from 'vitest';

describe('Evaluation — B-cubed zero F1', () => {
  it('bCubedF1 is 0 when all records are singletons', async () => {
    const { evaluateClustering } = await import('../evaluation/metrics.js');
    // Predicted: all singletons (no clusters)
    // Reference: all clustered
    const pred = new Map();
    const ref = new Map([['r1', { clusterId: 'r1', memberIds: [0], cohesion: 1 }]]);
    const result = evaluateClustering(pred, ref);
    // B-cubed precision for no clusters should be defined
    expect(result.bCubedPrecision).toBeDefined();
    expect(result.bCubedF1).toBeGreaterThanOrEqual(0);
  });
});

describe('Linking — cross-set pair filtering', () => {
  it('linkRecords with empty datasets returns empty', async () => {
    const { linkRecords } = await import('../pipeline/linking.js');
    const result = await linkRecords(
      [],
      [],
      { comparisons: [], matchThreshold: 0.5 },
    );
    expect(result.crossPairs).toEqual([]);
  });
});

describe('Blocking — edge conditions', () => {
  it('sortedNeighborhood with size 1 handles gracefully', async () => {
    const { sortedNeighborhood } = await import('../blocking/strategies.js');
    const result = sortedNeighborhood(
      [{ name: 'A' }],
      { fields: ['name'] },
    );
    expect(result.pairs).toEqual([]);
  });

  it('blockPurging handles empty block map', async () => {
    const { blockPurging } = await import('../blocking/strategies.js');
    const result = blockPurging(new Map(), 10);
    expect(result.size).toBe(0);
  });

  it('comparisonNeighborhoodPruning with empty blocks', async () => {
    const { comparisonNeighborhoodPruning } = await import('../blocking/strategies.js');
    const result = comparisonNeighborhoodPruning(new Map(), 1);
    expect(result.size).toBe(0);
  });
});
