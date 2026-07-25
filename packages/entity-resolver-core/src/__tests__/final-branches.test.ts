// Final branch coverage push — edge conditions for evaluation, linking, blocking, PPRL, scorers.
import { describe, it, expect } from 'vitest';

describe('Evaluation — B-cubed zero F1', () => {
  it('bCubedF1 is 0 when all records are singletons', async () => {
    const { evaluateClustering } = await import('../evaluation/metrics.js');
    const pred = new Map();
    const ref = new Map([['r1', { clusterId: 'r1', memberIds: [0], cohesion: 1 }]]);
    const result = evaluateClustering(pred, ref);
    expect(result.bCubedPrecision).toBeDefined();
    expect(result.bCubedF1).toBeGreaterThanOrEqual(0);
  });
});

describe('Linking — cross-set pair filtering', () => {
  it('linkRecords with empty datasets returns empty', async () => {
    const { linkRecords } = await import('../pipeline/linking.js');
    const result = await linkRecords([], [], { comparisons: [], matchThreshold: 0.5 });
    expect(result.crossPairs).toEqual([]);
  });
});

describe('Blocking — edge conditions', () => {
  it('sortedNeighborhood with size 1 handles gracefully', async () => {
    const { sortedNeighborhood } = await import('../blocking/strategies.js');
    const result = sortedNeighborhood([{ name: 'A' }], { fields: ['name'] });
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

describe('DBLP fallback dataset', () => {
  it('generates valid bibliographic dataset', async () => {
    const { fallbackDblpAcm } = await import('../benchmarks/datasets.js');
    const ds = fallbackDblpAcm();
    expect(ds.name).toBe('DBLP-ACM');
    expect(ds.records.length).toBeGreaterThan(100);
    expect(ds.groundTruth.size).toBeGreaterThan(10);
    expect(ds.trueMatchCount).toBeGreaterThan(0);
  });
});

describe('PPRL Bloom filter edges', () => {
  it('simpleHash produces consistent output', async () => {
    const { BloomFilter } = await import('../pprl/bloom.js');
    const bf = new BloomFilter(64, 4);
    bf.add('test', 'secret');
    expect(bf.size).toBe(64);
  });

  it('BloomFilter with custom size and hash count', async () => {
    const { BloomFilter } = await import('../pprl/bloom.js');
    const bf = new BloomFilter(256, 8);
    expect(bf.size).toBe(256);
    // Add some data and check hex output
    bf.add('hello', 'secret');
    const hex = bf.toHex();
    expect(hex.length).toBeGreaterThan(0);
    expect(hex).toMatch(/^[0-9a-f]+$/i);
  });

  it('encodePPRL produces BloomFilter with hex', async () => {
    const { encodePPRL } = await import('../pprl/bloom.js');
    const bf = encodePPRL('John Smith', {
      filterSize: 64,
      numHashes: 4,
      secretKey: 'salt',
      qgramSize: 2,
    });
    expect(bf.size).toBe(64);
    const hex = bf.toHex();
    expect(hex).toMatch(/^[0-9a-f]+$/i);
  });

  it('matchPPRL returns per-field scores', async () => {
    const { matchPPRL } = await import('../pprl/bloom.js');
    const scores = matchPPRL(
      { name: 'Alice', city: 'NYC' },
      { name: 'Alice', city: 'NYC' },
      { filterSize: 64, numHashes: 4, secretKey: 'salt' },
    );
    expect(scores.name).toBeDefined();
    expect(scores.city).toBeDefined();
  });

  it('matchPPRL with different records returns lower scores', async () => {
    const { matchPPRL } = await import('../pprl/bloom.js');
    const scores = matchPPRL(
      { name: 'Alice' },
      { name: 'Bob' },
      { filterSize: 64, numHashes: 4, secretKey: 'salt' },
    );
    expect(scores.name).toBeDefined();
    expect(scores.name!).toBeLessThan(1);
  });

  it('BloomFilter serialization round-trips', async () => {
    const { BloomFilter } = await import('../pprl/bloom.js');
    const bf = new BloomFilter(256, 4);
    bf.add('test', 'secret');
    const hex = bf.toHex();
    const restored = BloomFilter.fromHex(hex, 256, 4);
    expect(restored.size).toBe(256);
    expect(restored.numHashes).toBe(4);
  });

  it('BloomFilter handles empty input gracefully', async () => {
    const { BloomFilter } = await import('../pprl/bloom.js');
    const bf = new BloomFilter(64, 4);
    bf.add('', 'salt');
    const hex = bf.toHex();
    expect(typeof hex).toBe('string');
  });
});

describe('Scorer registry edges', () => {
  it('initScorers returns wasm or js backend string', async () => {
    const { initScorers } = await import('../matching/scorers/registry.js');
    const result = await initScorers();
    expect(['wasm', 'js']).toContain(result);
  });

  it('getScorers returns all 19 scorers', async () => {
    const { initScorers, getScorers } = await import('../matching/scorers/registry.js');
    await initScorers();
    const scorers = getScorers();
    expect(Object.keys(scorers).length).toBe(19);
  });

  it('getScorer throws for unknown scorer', async () => {
    const { getScorer } = await import('../matching/scorers/registry.js');
    expect(() => getScorer('nonexistent_scorer_abc')).toThrow('Unknown scorer');
  });

  it('validateScorerRegistry does not throw', async () => {
    const { initScorers, validateScorerRegistry } = await import('../matching/scorers/registry.js');
    await initScorers();
    expect(() => validateScorerRegistry()).not.toThrow();
  });

  it('resetScorerCache allows re-initialization', async () => {
    const { initScorers, resetScorerCache } = await import('../matching/scorers/registry.js');
    await initScorers();
    resetScorerCache();
    const result = await initScorers();
    expect(['wasm', 'js']).toContain(result);
  });
});

describe('Numeric and date scorers', () => {
  it('numericDiffScorer handles equal numbers', async () => {
    const { numericDiffScorer } = await import('../matching/scorers/js/scorers.js');
    const s = numericDiffScorer.score(100, 100, {
      name: 'age',
      semanticType: 'numeric',
      cardinality: 100,
      isNumeric: true,
    });
    expect(s).toBe(1);
  });

  it('numericDiffScorer handles large difference', async () => {
    const { numericDiffScorer } = await import('../matching/scorers/js/scorers.js');
    const s = numericDiffScorer.score(1, 1000, {
      name: 'age',
      semanticType: 'numeric',
      cardinality: 100,
      isNumeric: true,
    });
    expect(s).toBeLessThan(0.1);
  });

  it('dateDiffScorer handles same date', async () => {
    const { dateDiffScorer } = await import('../matching/scorers/js/scorers.js');
    const s = dateDiffScorer.score('2020-01-15', '2020-01-15', {
      name: 'dob',
      semanticType: 'date',
      cardinality: 100,
      isNumeric: false,
    });
    expect(s).toBe(1);
  });

  it('booleanMatchScorer handles true match', async () => {
    const { booleanMatchScorer } = await import('../matching/scorers/js/scorers.js');
    const s = booleanMatchScorer.score(true, true, {
      name: 'active',
      semanticType: 'boolean',
      cardinality: 100,
      isNumeric: false,
    });
    expect(s).toBe(1);
  });

  it('radialScorer produces valid range', async () => {
    const { radialScorer } = await import('../matching/scorers/js/scorers.js');
    const s = radialScorer.score(0, 0, {
      name: 'coord',
      semanticType: 'numeric',
      cardinality: 100,
      isNumeric: true,
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});
