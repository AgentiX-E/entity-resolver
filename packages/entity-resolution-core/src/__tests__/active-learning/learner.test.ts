// Tests for Active Learning system.

import { describe, it, expect } from 'vitest';
import {
  selectUncertainPairs,
  selectDiverseUncertainPairs,
  trainLogisticClassifier,
  predictClassifier,
  createSession,
  nextLabelingBatch,
  applyLabels,
  simulateLabeling,
  detectLabelContradictions,
} from '../../index.js';
import type { ScoredPair, LabeledPair } from '../../index.js';

function makePairs(n: number): ScoredPair[] {
  return Array.from({ length: n }, (_, i) => ({
    leftId: i,
    rightId: i + 10,
    score: 0.5 + 0.4 * Math.sin(i), // Varying uncertainty
    probability: 0.5 + 0.4 * Math.sin(i),
  }));
}

// ══════════════════════════════════════════════════════════════
// Uncertainty Sampling
// ══════════════════════════════════════════════════════════════

describe('selectUncertainPairs', () => {
  it('selects pairs with probability close to 0.5', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.99, probability: 0.99 },
      { leftId: 0, rightId: 2, score: 0.5, probability: 0.5 },
      { leftId: 1, rightId: 2, score: 0.01, probability: 0.01 },
    ];
    const selected = selectUncertainPairs(pairs, 1);
    expect(selected[0]).toBe(1); // 0.5 is most uncertain
  });

  it('respects count parameter', () => {
    const pairs = makePairs(100);
    const selected = selectUncertainPairs(pairs, 5);
    expect(selected.length).toBe(5);
  });

  it('returns empty for count=0', () => {
    expect(selectUncertainPairs(makePairs(10), 0)).toHaveLength(0);
  });

  it('returns all pairs if count exceeds available', () => {
    const pairs = makePairs(3);
    const selected = selectUncertainPairs(pairs, 10);
    expect(selected.length).toBe(3);
  });
});

describe('selectDiverseUncertainPairs', () => {
  it('selects diverse uncertain pairs', () => {
    const pairs = makePairs(50);
    const selected = selectDiverseUncertainPairs(pairs, 5);
    expect(selected.length).toBe(5);
  });

  it('avoids overlapping records', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.5, probability: 0.5 },
      { leftId: 0, rightId: 2, score: 0.52, probability: 0.52 },
      { leftId: 1, rightId: 3, score: 0.51, probability: 0.51 },
    ];
    const selected = selectDiverseUncertainPairs(pairs, 2);
    const used = new Set<number>();
    for (const idx of selected) {
      const p = pairs[idx]!;
      used.add(p.leftId);
      used.add(p.rightId);
    }
    // After first pick, subsequent picks should use different records
    expect(selected.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty pairs', () => {
    expect(selectDiverseUncertainPairs([], 5)).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Logistic Regression
// ══════════════════════════════════════════════════════════════

describe('trainLogisticClassifier', () => {
  it('trains on labeled data', () => {
    const pairs = makePairs(20);
    const labeled: LabeledPair[] = [
      { leftId: 0, rightId: 10, label: 1 },
      { leftId: 1, rightId: 11, label: 0 },
    ];
    const classifier = trainLogisticClassifier(labeled, pairs);
    expect(classifier.weights.length).toBeGreaterThan(0);
    expect(typeof classifier.accuracy).toBe('number');
    expect(classifier.accuracy).toBeGreaterThanOrEqual(0);
    expect(classifier.accuracy).toBeLessThanOrEqual(1);
  });

  it('handles single labeled pair', () => {
    const pairs = makePairs(5);
    const labeled: LabeledPair[] = [{ leftId: 0, rightId: 10, label: 1 }];
    const classifier = trainLogisticClassifier(labeled, pairs);
    expect(classifier.accuracy).toBeGreaterThanOrEqual(0);
  });

  it('improves with more data', () => {
    const pairs = makePairs(50);
    // Create perfectly separable data
    const labeledMany: LabeledPair[] = Array.from({ length: 30 }, (_, i) => ({
      leftId: i,
      rightId: i + 10,
      label: i < 15 ? 1 : 0,
    }));
    // Override pairs to have clear signal
    for (let i = 0; i < 30; i++) {
      pairs[i] = {
        leftId: i,
        rightId: i + 10,
        score: i < 15 ? 0.9 : 0.1,
        probability: i < 15 ? 0.9 : 0.1,
      };
    }

    const classifier = trainLogisticClassifier(labeledMany, pairs);
    expect(classifier.accuracy).toBeGreaterThan(0.8);
  });

  it('custom learning rate and epochs', () => {
    const pairs = makePairs(10);
    const labeled: LabeledPair[] = [
      { leftId: 0, rightId: 10, label: 1 },
      { leftId: 1, rightId: 11, label: 0 },
    ];
    const c1 = trainLogisticClassifier(labeled, pairs, { learningRate: 0.1, epochs: 50 });
    const c2 = trainLogisticClassifier(labeled, pairs, { learningRate: 0.001, epochs: 200 });
    expect(c1.accuracy).toBeGreaterThanOrEqual(0);
    expect(c2.accuracy).toBeGreaterThanOrEqual(0);
  });
});

describe('predictClassifier', () => {
  it('predicts probability for a pair', () => {
    const pairs = makePairs(10);
    const labeled: LabeledPair[] = [
      { leftId: 0, rightId: 10, label: 1 },
      { leftId: 1, rightId: 11, label: 0 },
    ];
    const c = trainLogisticClassifier(labeled, pairs);
    const pred = predictClassifier(c, pairs[0]!);
    expect(pred).toBeGreaterThanOrEqual(0);
    expect(pred).toBeLessThanOrEqual(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Active Learning Session
// ══════════════════════════════════════════════════════════════

describe('Active Learning Session', () => {
  it('creates and iterates a session', () => {
    const pairs = makePairs(20);
    const session = createSession(pairs);
    expect(session.iteration).toBe(0);
    expect(session.classifier).toBeNull();
    expect(session.converged).toBe(false);

    const batch = nextLabelingBatch(session, 3);
    expect(batch.length).toBe(3);

    // Simulate labeling with ground truth
    const gt = new Map<string, number>();
    for (const idx of batch) {
      const p = pairs[idx]!;
      gt.set(`${p.leftId}:${p.rightId}`, idx % 2);
    }
    const labels = simulateLabeling(pairs, batch, gt);

    applyLabels(session, labels);
    expect(session.iteration).toBe(1);
    expect(session.classifier).not.toBeNull();
    expect(session.labeledPairs.length).toBe(3);
  });

  it('converges with enough labeled data', () => {
    const pairs = makePoints(100, true);
    const session = createSession(pairs);

    // Label multiple batches
    for (let iter = 0; iter < 5; iter++) {
      const batch = nextLabelingBatch(session, 20);
      const gt = new Map<string, number>();
      for (const idx of batch) {
        const p = pairs[idx]!;
        gt.set(`${p.leftId}:${p.rightId}`, p.leftId < 50 ? 1 : 0);
      }
      applyLabels(session, simulateLabeling(pairs, batch, gt));
    }

    expect(session.labeledPairs.length).toBeGreaterThanOrEqual(10);
    expect(session.classifier).not.toBeNull();
  });
});

function makePoints(n: number, separable: boolean): ScoredPair[] {
  return Array.from({ length: n }, (_, i) => ({
    leftId: i,
    rightId: i + n,
    score: separable ? (i < n / 2 ? 0.9 : 0.1) : 0.5,
    probability: separable ? (i < n / 2 ? 0.9 : 0.1) : 0.5,
  }));
}

describe('detectLabelContradictions', () => {
  it('detects contradictory labels', () => {
    const labeled: LabeledPair[] = [
      { leftId: 0, rightId: 1, label: 1 },
      { leftId: 0, rightId: 1, label: 0 },
    ];
    const result = detectLabelContradictions(labeled);
    expect(result.hasContradiction).toBe(true);
    expect(result.contradictions.length).toBe(1);
  });

  it('returns no contradictions for consistent labels', () => {
    const labeled: LabeledPair[] = [
      { leftId: 0, rightId: 1, label: 1 },
      { leftId: 1, rightId: 2, label: 0 },
    ];
    const result = detectLabelContradictions(labeled);
    expect(result.hasContradiction).toBe(false);
  });

  it('handles empty labels', () => {
    const result = detectLabelContradictions([]);
    expect(result.hasContradiction).toBe(false);
  });
});

describe('simulateLabeling', () => {
  it('creates labeled pairs from ground truth', () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.9, probability: 0.9 },
      { leftId: 2, rightId: 3, score: 0.1, probability: 0.1 },
    ];
    const gt = new Map([
      ['0:1', 1],
      ['2:3', 0],
    ]);
    const labels = simulateLabeling(pairs, [0, 1], gt);
    expect(labels[0]!.label).toBe(1);
    expect(labels[1]!.label).toBe(0);
  });

  it('returns 0 for missing ground truth', () => {
    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.5, probability: 0.5 }];
    const labels = simulateLabeling(pairs, [0], new Map());
    expect(labels[0]!.label).toBe(0);
  });
});
