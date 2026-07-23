// Active Learning for entity-resolver.
// Uncertainty sampling + logistic regression classifier + iterative labeling loop.

import type { ScoredPair } from '../types/core.js';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

/** A labeled pair: match (1) or non-match (0). */
export interface LabeledPair {
  readonly leftId: number;
  readonly rightId: number;
  readonly label: number; // 1 = match, 0 = non-match
}

/** Active learning session state. */
export interface ActiveLearningSession {
  readonly labeledPairs: LabeledPair[];
  readonly unlabeledPairs: ScoredPair[];
  readonly iteration: number;
  readonly classifier: LogisticClassifier | null;
  readonly converged: boolean;
}

/** Logistic regression classifier for match prediction. */
export interface LogisticClassifier {
  readonly weights: readonly number[];
  readonly bias: number;
  readonly accuracy: number;
}

// ══════════════════════════════════════════════════════════════
// Uncertainty Sampling
// ══════════════════════════════════════════════════════════════

/**
 * Select the most uncertain pairs for labeling.
 * Uncertainty = 1 - |2 * probability - 1| (maximal at probability = 0.5)
 *
 * @param pairs All scored candidate pairs
 * @param count Number of most uncertain pairs to select
 * @returns Indices of the most uncertain pairs (sorted by uncertainty descending)
 */
export function selectUncertainPairs(pairs: readonly ScoredPair[], count: number): number[] {
  // Score uncertainty for each pair
  const scored = pairs.map((p, i) => ({
    index: i,
    uncertainty: 1 - Math.abs(2 * (p.probability ?? p.score) - 1),
  }));

  // Sort by uncertainty descending
  scored.sort((a, b) => b.uncertainty - a.uncertainty);

  return scored.slice(0, count).map((s) => s.index);
}

/**
 * Select a diverse batch of uncertain pairs using greedy diversity sampling.
 * After picking the most uncertain pair, subsequent picks are penalized if
 * they share records with already-selected pairs (prevents labeling redundant info).
 */
export function selectDiverseUncertainPairs(pairs: readonly ScoredPair[], count: number): number[] {
  if (pairs.length === 0) return [];

  const selected: number[] = [];
  const usedRecords = new Set<number>();
  const available = pairs.map((p, i) => ({ index: i, pair: p }));

  while (selected.length < count && available.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (const { index, pair } of available) {
      const uncertainty = 1 - Math.abs(2 * (pair.probability ?? pair.score) - 1);
      // Diversity penalty: penalize pairs sharing records with already-selected
      const overlap = usedRecords.has(pair.leftId) || usedRecords.has(pair.rightId) ? 0.5 : 0;
      const score = uncertainty - overlap;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = index;
      }
    }

    if (bestIdx < 0) break;

    const chosen = pairs[bestIdx]!;
    selected.push(bestIdx);
    usedRecords.add(chosen.leftId);
    usedRecords.add(chosen.rightId);
  }

  return selected;
}

// ══════════════════════════════════════════════════════════════
// Logistic Regression Classifier
// ══════════════════════════════════════════════════════════════

/**
 * Train a logistic regression classifier on labeled pairs.
 * Uses gradient descent with sigmoid activation.
 */
export function trainLogisticClassifier(
  labeled: readonly LabeledPair[],
  pairs: readonly ScoredPair[],
  options?: { learningRate?: number; epochs?: number },
): LogisticClassifier {
  const lr = options?.learningRate ?? 0.01;
  const epochs = options?.epochs ?? 100;

  if (labeled.length < 2) {
    return { weights: [0], bias: 0, accuracy: 0.5 };
  }

  // Feature: use the probability/score as the single feature
  // More features can be added in future iterations
  const features = labeled.map((l) => {
    const pair = pairs.find((p) => p.leftId === l.leftId && p.rightId === l.rightId);
    return [pair?.probability ?? pair?.score ?? 0.5];
  });

  const labels = labeled.map((l) => l.label);
  const n = features.length;
  const d = features[0]!.length;

  // Initialize weights
  let weights = new Array<number>(d).fill(0);
  let bias = 0;

  function sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
  }

  // Gradient descent
  for (let epoch = 0; epoch < epochs; epoch++) {
    let dw = new Array<number>(d).fill(0).fill(0);
    let db = 0;

    for (let i = 0; i < n; i++) {
      const z = weights.reduce((s, w, j) => s + w * (features[i]![j] ?? 0), 0) + bias;
      const pred = sigmoid(z);
      const error = pred - (labels[i] ?? 0);

      for (let j = 0; j < d; j++) {
        dw[j]! += error * (features[i]![j] ?? 0);
      }
      db += error;
    }

    for (let j = 0; j < d; j++) {
      weights[j]! -= (lr * dw[j]!) / n;
    }
    bias -= (lr * db) / n;
  }

  // Compute accuracy on training data
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const z = weights.reduce((s, w, j) => s + w * features[i]![j]!, 0) + bias;
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === labels[i]) correct++;
  }

  return {
    weights,
    bias,
    accuracy: n > 0 ? correct / n : 0.5,
  };
}

/**
 * Predict match probability for a pair using a trained classifier.
 */
export function predictClassifier(classifier: LogisticClassifier, pair: ScoredPair): number {
  const x = pair.probability ?? pair.score;
  const z = classifier.weights[0]! * x + classifier.bias;
  return 1 / (1 + Math.exp(-z));
}

// ══════════════════════════════════════════════════════════════
// Active Learning Loop
// ══════════════════════════════════════════════════════════════

/**
 * Create a new active learning session.
 */
export function createSession(pairs: readonly ScoredPair[]): ActiveLearningSession {
  return {
    labeledPairs: [],
    unlabeledPairs: [...pairs],
    iteration: 0,
    classifier: null,
    converged: false,
  };
}

/**
 * Select the next batch of pairs to label and update the session.
 * Returns the indices (into the original pairs array) to label next.
 */
export function nextLabelingBatch(session: ActiveLearningSession, batchSize: number): number[] {
  const indices = selectDiverseUncertainPairs(session.unlabeledPairs, batchSize);
  return indices;
}

/**
 * Apply labels to the session and retrain the classifier.
 */
export function applyLabels(session: ActiveLearningSession, labels: readonly LabeledPair[]): void {
  session.labeledPairs.push(...labels);
  (session as any).iteration++;

  // Retrain classifier
  (session as any).classifier = trainLogisticClassifier(
    session.labeledPairs,
    session.unlabeledPairs,
  );

  // Check convergence: if accuracy stops improving
  if (session.labeledPairs.length >= 10 && (session.classifier?.accuracy ?? 0) >= 0.95) {
    (session as any).converged = true;
  }
}

/**
 * Simulate labeling by using ground truth data.
 * Returns labeled pairs for the given indices.
 */
export function simulateLabeling(
  pairs: readonly ScoredPair[],
  indices: readonly number[],
  groundTruth: ReadonlyMap<string, number>, // "leftId:rightId" → 1 or 0
): LabeledPair[] {
  return indices.map((i) => {
    const pair = pairs[i]!;
    const key = `${pair.leftId}:${pair.rightId}`;
    const label = groundTruth.get(key) ?? 0;
    return { leftId: pair.leftId, rightId: pair.rightId, label };
  });
}

/**
 * Assess labeling quality by detecting contradictory labels.
 * Contradiction: the same pair labeled differently, or a transitive
 * contradiction (A≈B labeled 1, B≈C labeled 1, but A≈C labeled 0).
 */
export function detectLabelContradictions(labeled: readonly LabeledPair[]): {
  contradictions: string[];
  hasContradiction: boolean;
} {
  const contradictions: string[] = [];
  const labelMap = new Map<string, number>();

  for (const lp of labeled) {
    const key = `${lp.leftId}:${lp.rightId}`;
    const existing = labelMap.get(key);
    if (existing !== undefined && existing !== lp.label) {
      contradictions.push(
        `Contradiction: pair (${lp.leftId},${lp.rightId}) labeled as ${lp.label} and ${existing}`,
      );
    }
    labelMap.set(key, lp.label);
  }

  return { contradictions, hasContradiction: contradictions.length > 0 };
}
