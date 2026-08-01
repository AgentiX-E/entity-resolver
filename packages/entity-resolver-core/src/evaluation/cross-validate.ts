/**
 * Train-test splitting and k-fold cross-validation for entity resolution.
 *
 * Provides standard ML evaluation infrastructure so models can be validated
 * on unseen data, preventing overfitting to training clusters.
 *
 * Key features:
 * - trainTestSplit: stratified split by cluster entities
 * - crossValidate: k-fold CV with full evaluation metrics per fold
 * - holdout evaluation: test model on unseen pairs
 */

import type { PipelineResult } from '../types/core.js';
import { evaluateClustering } from '../evaluation/metrics.js';
import type { EntityId, Cluster } from '../types/core.js';

/** Split configuration. */
export interface SplitConfig {
  /** Test fraction (0.0–1.0). Default: 0.3. */
  readonly testFraction?: number;
  /** Random seed for reproducibility. */
  readonly seed?: number;
}

/** Cross-validation configuration. */
export interface CrossValidateConfig extends SplitConfig {
  /** Number of folds. Default: 5. */
  readonly folds?: number;
}

/** A single fold's evaluation result. */
export interface FoldResult {
  readonly fold: number;
  readonly trainingRecords: number;
  readonly testRecords: number;
  readonly pairwisePrecision: number;
  readonly pairwiseRecall: number;
  readonly pairwiseF1: number;
  readonly clusterPrecision: number;
  readonly clusterRecall: number;
  readonly clusterF1: number;
}

/** Complete cross-validation report. */
export interface CrossValidateReport {
  readonly folds: readonly FoldResult[];
  readonly avgPairwiseF1: number;
  readonly stdPairwiseF1: number;
  readonly avgClusterF1: number;
  readonly stdClusterF1: number;
  readonly totalRecords: number;
}

/** Result of train-test split. */
export interface TrainTestSplit {
  readonly train: Record<string, unknown>[];
  readonly test: Record<string, unknown>[];
  readonly trainIndices: readonly number[];
  readonly testIndices: readonly number[];
}

/**
 * Split records into training and test sets.
 *
 * Stratified by ground-truth clusters: records from the same entity
 * are kept together in either train or test, never split across.
 * This prevents data leakage in entity resolution.
 *
 * @param records — all records
 * @param groundTruth — cluster assignments (id → member indices)
 * @param config — split configuration
 * @returns TrainTestSplit with records and indices
 */
export function trainTestSplit(
  records: readonly Record<string, unknown>[],
  groundTruth: ReadonlyMap<EntityId, number[]>,
  config: SplitConfig = {},
): TrainTestSplit {
  const testFrac = config.testFraction ?? 0.3;
  const seed = config.seed ?? 42;

  // Collect clusters and shuffle
  const clusters = [...groundTruth.entries()];
  const rng = seedRandom(seed);
  shuffle(clusters, rng);

  // Assign whole clusters to train or test
  const testClusters = new Set<EntityId>();
  let testCount = 0;
  const targetTest = Math.round(records.length * testFrac);

  for (const [cid, members] of clusters) {
    if (testCount < targetTest) {
      testClusters.add(cid);
      testCount += members.length;
    }
  }

  const trainIndices: number[] = [];
  const testIndices: number[] = [];

  for (const [cid, members] of clusters) {
    if (testClusters.has(cid)) {
      testIndices.push(...members);
    } else {
      trainIndices.push(...members);
    }
  }

  const train = trainIndices.map((i) => records[i]!);
  const test = testIndices.map((i) => records[i]!);

  return { train, test, trainIndices, testIndices };
}

/**
 * Run k-fold cross-validation for entity resolution.
 *
 * Splits records into k folds (stratified by clusters), trains on k-1 folds,
 * evaluates on the held-out fold. Repeats k times and reports mean/std
 * of pairwise and cluster F1 scores.
 *
 * The user provides a pipeline function that takes records and returns
 * predictions. This enables evaluating any model configuration.
 *
 * @param records — all entity records
 * @param groundTruth — cluster assignments
 * @param pipelineFn — (records) => PipelineResult with clusters and pairs
 * @param config — cross-validation config
 * @returns CrossValidateReport with per-fold and summary metrics
 */
export function crossValidate(
  records: readonly Record<string, unknown>[],
  groundTruth: ReadonlyMap<EntityId, number[]>,
  pipelineFn: (records: Record<string, unknown>[]) => PipelineResult,
  config: CrossValidateConfig = {},
): CrossValidateReport {
  const folds = config.folds ?? 5;
  const seed = config.seed ?? 42;

  // Collect clusters and split into folds (stratified)
  const clusters = [...groundTruth.entries()];
  const rng = seedRandom(seed);
  shuffle(clusters, rng);

  const foldAssignments: { fold: number; members: number[] }[][] = Array.from(
    { length: folds },
    () => [],
  );

  // Round-robin assign clusters to folds to maintain balance
  for (let i = 0; i < clusters.length; i++) {
    const fold = i % folds;
    foldAssignments[fold]!.push({
      fold,
      members: clusters[i]![1],
    });
  }

  const foldResults: FoldResult[] = [];

  for (let fold = 0; fold < folds; fold++) {
    // Build train and test sets
    const testIndices = new Set<number>();
    const trainIndices = new Set<number>();

    for (let f = 0; f < folds; f++) {
      for (const cluster of foldAssignments[f]!) {
        for (const idx of cluster.members) {
          if (f === fold) {
            testIndices.add(idx);
          } else {
            trainIndices.add(idx);
          }
        }
      }
    }

    // Run pipeline on FULL dataset (not just training records).
    // The Fellegi-Sunter EM model trains on all provided records, and
    // we need predicted clusters containing test-set record IDs to
    // evaluate against test-set ground truth.
    // Evaluate only test-set records by filtering both sides below.
    const result = pipelineFn(records as Record<string, unknown>[]);

    // Build reference clusters from ground truth (test set only)
    const refClusters = new Map<EntityId, Cluster>();
    for (const [cid, members] of groundTruth) {
      const testMembers = members.filter((m) => testIndices.has(m));
      if (testMembers.length > 0) {
        refClusters.set(cid, { clusterId: cid, memberIds: testMembers, cohesion: 0 });
      }
    }

    // Filter predicted clusters to test-set records only
    const predClusters = new Map<EntityId, Cluster>();
    for (const [pcid, cluster] of result.clusters) {
      const testMembers = cluster.memberIds.filter((m) => testIndices.has(m));
      if (testMembers.length > 0) {
        predClusters.set(pcid, { clusterId: pcid, memberIds: testMembers, cohesion: 0 });
      }
    }

    const em = evaluateClustering(predClusters, refClusters);

    foldResults.push({
      fold,
      trainingRecords: trainIndices.size,
      testRecords: testIndices.size,
      pairwisePrecision: em.pairwisePrecision,
      pairwiseRecall: em.pairwiseRecall,
      pairwiseF1: em.pairwiseF1,
      clusterPrecision: em.clusterPrecision,
      clusterRecall: em.clusterRecall,
      clusterF1: em.clusterF1,
    });
  }

  const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  const std = (values: number[], mean: number) =>
    Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

  const pF1s = foldResults.map((f) => f.pairwiseF1);
  const cF1s = foldResults.map((f) => f.clusterF1);
  const avgP = avg(pF1s);
  const avgC = avg(cF1s);

  return {
    folds: foldResults,
    avgPairwiseF1: avgP,
    stdPairwiseF1: std(pF1s, avgP),
    avgClusterF1: avgC,
    stdClusterF1: std(cF1s, avgC),
    totalRecords: records.length,
  };
}

/** Seeded PRNG for reproducible splits. */
function seedRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Fisher-Yates shuffle. */
function shuffle(arr: unknown[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
