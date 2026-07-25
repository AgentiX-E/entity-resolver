// Integration tests for cross-validation + train-test split.
import { describe, it, expect } from 'vitest';
import { trainTestSplit, crossValidate } from '../../evaluation/cross-validate.js';
import { runPipeline } from '../../pipeline/runner.js';
import type { PipelineResult } from '../../types/core.js';

const records = Array.from({ length: 40 }, (_, i) => ({
  name: `Name${Math.floor(i / 2)}`,
  value: String(i),
}));

const groundTruth = new Map<string, number[]>();
for (let i = 0; i < 20; i++) {
  groundTruth.set(`e${i}`, [i * 2, i * 2 + 1]);
}

describe('trainTestSplit', () => {
  it('returns train and test records', () => {
    const split = trainTestSplit(records, groundTruth, { testFraction: 0.3, seed: 42 });
    expect(split.train.length).toBeGreaterThan(0);
    expect(split.test.length).toBeGreaterThan(0);
    expect(split.train.length + split.test.length).toBe(40);
  });

  it('keeps entity clusters together', () => {
    const split = trainTestSplit(records, groundTruth, { testFraction: 0.3, seed: 42 });
    // If record 0 is in train, record 1 (same cluster) must also be in train
    const inTrain = new Set(split.trainIndices);
    for (const [, members] of groundTruth) {
      const allSame = members.every((m) => inTrain.has(m)) || members.every((m) => !inTrain.has(m));
      expect(allSame).toBe(true);
    }
  });

  it('respects seed for reproducibility', () => {
    const s1 = trainTestSplit(records, groundTruth, { seed: 99, testFraction: 0.3 });
    const s2 = trainTestSplit(records, groundTruth, { seed: 99, testFraction: 0.3 });
    expect(s1.trainIndices).toEqual(s2.trainIndices);
    expect(s1.testIndices).toEqual(s2.testIndices);
  });

  it('default testFraction is 0.3', () => {
    const split = trainTestSplit(records, groundTruth);
    expect(split.test.length).toBeGreaterThan(0);
    expect(split.test.length).toBeLessThan(records.length);
  });
});

describe('crossValidate', () => {
  const pipelineFn = (recs: Record<string, unknown>[]): PipelineResult => {
    // Simulate a simple pipeline that clusters by name
    return {
      clusters: new Map(),
      scoredPairs: [],
      singletons: recs.map((_, i) => i),
      statistics: { totalRecords: recs.length, totalClusters: 0, matchedRecords: 0, matchRate: 0, averageClusterSize: 0, maxClusterSize: 0, executionTimeMs: 0 },
      diagnostics: { muParameters: new Map(), matchWeightDistribution: [], unlinkableCount: 0 },
    };
  };

  it('returns per-fold results', () => {
    const report = crossValidate(records, groundTruth, pipelineFn, { folds: 3, seed: 42 });
    expect(report.folds.length).toBe(3);
    expect(report.totalRecords).toBe(40);
  });

  it('computes mean and std of F1 scores', () => {
    const report = crossValidate(records, groundTruth, pipelineFn, { folds: 3, seed: 42 });
    expect(typeof report.avgPairwiseF1).toBe('number');
    expect(typeof report.stdPairwiseF1).toBe('number');
    expect(typeof report.avgClusterF1).toBe('number');
  });

  it('default folds is 5', () => {
    const report = crossValidate(records, groundTruth, pipelineFn);
    expect(report.folds.length).toBe(5);
  });

  it('each fold has trainingRecords + testRecords', () => {
    const report = crossValidate(records, groundTruth, pipelineFn, { folds: 3, seed: 42 });
    for (const fold of report.folds) {
      expect(fold.trainingRecords).toBeGreaterThan(0);
      expect(fold.testRecords).toBeGreaterThan(0);
      expect(fold.trainingRecords + fold.testRecords).toBeLessThanOrEqual(40);
    }
  });
});
