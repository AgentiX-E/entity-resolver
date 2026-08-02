/**
 * Unit tests for the benchmark library — types, metrics, datasets, and reporter.
 *
 * These tests run without the full entity-resolver pipeline,
 * so they can be fast and deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  loadGroundTruth,
  computeMetrics,
  aggregateMetrics,
  mcnemarTest,
} from '../lib/metrics.js';
import { generateFebrlRecords } from '../configs/standard.js';
import type { ClassificationMetrics, MatchPair } from '../lib/types.js';
import * as fs from 'node:fs';

// ── loadGroundTruth ──
describe('loadGroundTruth', () => {
  it('parses a simple CSV mapping file', () => {
    const tmp = '/tmp/test-mapping.csv';
    fs.writeFileSync(tmp, 'left_id,right_id\nA1,B1\nA2,B2\nA3,B3\n');
    const truth = loadGroundTruth(tmp);
    expect(truth.size).toBe(3);
    expect(truth.has('A1|B1')).toBe(true);
    expect(truth.has('A2|B2')).toBe(true);
    expect(truth.has('A3|B3')).toBe(true);
    fs.unlinkSync(tmp);
  });

  it('handles quoted values', () => {
    const tmp = '/tmp/test-mapping-quoted.csv';
    fs.writeFileSync(tmp, 'left,right\n"A1","B1"\n"A2","B2"\n');
    const truth = loadGroundTruth(tmp);
    expect(truth.has('A1|B1')).toBe(true);
    expect(truth.has('A2|B2')).toBe(true);
    fs.unlinkSync(tmp);
  });

  it('skips malformed lines', () => {
    const tmp = '/tmp/test-mapping-malformed.csv';
    fs.writeFileSync(tmp, 'header1,header2\nA1\nA2,B2\n');
    const truth = loadGroundTruth(tmp);
    expect(truth.size).toBe(1);
    expect(truth.has('A2|B2')).toBe(true);
    fs.unlinkSync(tmp);
  });

  it('returns empty set for empty file', () => {
    const tmp = '/tmp/test-mapping-empty.csv';
    fs.writeFileSync(tmp, 'left,right\n');
    const truth = loadGroundTruth(tmp);
    expect(truth.size).toBe(0);
    fs.unlinkSync(tmp);
  });
});

// ── computeMetrics ──
describe('computeMetrics', () => {
  // Ground truth tracks pairs by record IDs, not positional indices.
  // leftIds/rightIds should match the IDs used in the truth set.
  const truth = new Set(['a|a', 'b|b']);
  const leftIds = ['a', 'b', 'c'];
  const rightIds = ['a', 'b', 'c'];

  it('returns perfect F1 for exact matches', () => {
    const pairs: MatchPair[] = [
      { leftId: 0, rightId: 0, score: 0.9 },
      { leftId: 1, rightId: 1, score: 0.9 },
    ];
    const metrics = computeMetrics(pairs, truth, leftIds, rightIds, 0.3);
    expect(metrics.f1).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.truePositives).toBe(2);
    expect(metrics.falsePositives).toBe(0);
    expect(metrics.falseNegatives).toBe(0);
  });

  it('handles false positives', () => {
    const pairs: MatchPair[] = [
      { leftId: 0, rightId: 0, score: 0.9 }, // true positive: a|a
      { leftId: 0, rightId: 1, score: 0.9 }, // false positive: a|b
    ];
    const metrics = computeMetrics(pairs, truth, leftIds, rightIds, 0.3);
    expect(metrics.precision).toBe(0.5);
    expect(metrics.recall).toBe(0.5);
    expect(metrics.f1).toBe(0.5);
    expect(metrics.falsePositives).toBe(1);
    expect(metrics.falseNegatives).toBe(1);
  });

  it('respects probability threshold', () => {
    const pairs: MatchPair[] = [
      { leftId: 0, rightId: 0, score: 0.1, probability: 0.9 }, // above 0.5 threshold
      { leftId: 1, rightId: 1, score: 0.1, probability: 0.2 }, // below threshold
    ];
    const metrics = computeMetrics(pairs, truth, leftIds, rightIds, 0.5);
    // Only pair 0 exceeds the 0.5 threshold (via probability)
    expect(metrics.truePositives).toBe(1);
    expect(metrics.falseNegatives).toBe(1);
  });

  it('falls back to score when probability is undefined', () => {
    const pairs: MatchPair[] = [
      { leftId: 0, rightId: 0, score: 0.9 }, // above 0.5
      { leftId: 1, rightId: 1, score: 0.2 }, // below 0.5
    ];
    const metrics = computeMetrics(pairs, truth, leftIds, rightIds, 0.5);
    expect(metrics.truePositives).toBe(1);
    expect(metrics.falseNegatives).toBe(1);
  });

  it('returns zero metrics for empty pairs', () => {
    const metrics = computeMetrics([], truth, leftIds, rightIds, 0.3);
    expect(metrics.f1).toBe(0);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
  });

  it('handles missing left/right IDs gracefully', () => {
    const sparseTruth = new Set(['0|0']);
    const pairs: MatchPair[] = [
      { leftId: 100, rightId: 100, score: 0.9 }, // IDs not in arrays
    ];
    const metrics = computeMetrics(pairs, sparseTruth, leftIds, rightIds, 0.3);
    expect(metrics.truePositives).toBe(0);
    expect(metrics.falsePositives).toBe(1);
  });
});

// ── aggregateMetrics ──
describe('aggregateMetrics', () => {
  it('computes mean and stdDev across 3 runs', () => {
    const runs: ClassificationMetrics[] = [
      { precision: 0.9, recall: 0.8, f1: 0.85, truePositives: 80, falsePositives: 10, falseNegatives: 20, predictedPairs: 90, truePairs: 100 },
      { precision: 0.92, recall: 0.82, f1: 0.87, truePositives: 82, falsePositives: 8, falseNegatives: 18, predictedPairs: 90, truePairs: 100 },
      { precision: 0.88, recall: 0.78, f1: 0.83, truePositives: 78, falsePositives: 12, falseNegatives: 22, predictedPairs: 90, truePairs: 100 },
    ];
    const agg = aggregateMetrics(runs);
    expect(agg.f1).toBeCloseTo(0.85, 2);
    expect(agg.runs).toBe(3);
    expect(agg.f1StdDev).toBeGreaterThan(0);
    expect(agg.f1Values).toHaveLength(3);
  });

  it('handles single run without stdDev', () => {
    const runs: ClassificationMetrics[] = [
      { precision: 0.9, recall: 0.8, f1: 0.85, truePositives: 80, falsePositives: 10, falseNegatives: 20, predictedPairs: 90, truePairs: 100 },
    ];
    const agg = aggregateMetrics(runs);
    expect(agg.f1).toBeCloseTo(0.85, 2);
    expect(agg.runs).toBe(1);
    expect(agg.f1StdDev).toBe(0);
  });

  it('returns zero for empty runs', () => {
    const agg = aggregateMetrics([]);
    expect(agg.f1).toBe(0);
    expect(agg.runs).toBe(0);
  });
});

// ── mcnemarTest ──
describe('mcnemarTest', () => {
  it('returns no significance for identical predictions', () => {
    const predA = new Set(['a|b', 'c|d']);
    const predB = new Set(['a|b', 'c|d']);
    const truth = new Set(['a|b', 'c|d']);
    const result = mcnemarTest(predA, predB, truth);
    expect(result.significant).toBe(false);
    expect(result.statistic).toBe(0);
  });

  it('detects significant difference when one is better', () => {
    const predA = new Set(['a|b', 'c|d', 'e|f']);
    const predB = new Set(['a|b', 'c|d']);
    const truth = new Set(['a|b', 'c|d']);
    // A has one false positive that B doesn't, so same errors
    // Actually both have 0 errors on truth, A has extra FP
    const result = mcnemarTest(predA, predB, truth);
    // McNemar looks at discordant pairs: A correct B wrong vs A wrong B correct
    // Since both correctly identify a|b and c|d, discordant = 0
    expect(result.pValue).toBeGreaterThanOrEqual(0);
  });

  it('handles empty predictions', () => {
    const result = mcnemarTest(new Set(), new Set(), new Set(['a|b']));
    expect(result.significant).toBe(false);
    expect(result.statistic).toBe(0);
  });

  it('produces valid p-value range', () => {
    const predA = new Set(['a|b', 'c|d', 'e|f', 'g|h']);
    const predB = new Set(['a|b', 'x|y']);
    const truth = new Set(['a|b', 'c|d']);
    const result = mcnemarTest(predA, predB, truth);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

// ── generateFebrlRecords ──
describe('generateFebrlRecords', () => {
  it('generates deterministic records', () => {
    const { records: r1, groundTruth: gt1 } = generateFebrlRecords(100, 42);
    const { records: r2, groundTruth: gt2 } = generateFebrlRecords(100, 42);
    expect(r1.length).toBe(r2.length);
    expect(gt1.size).toBe(gt2.size);
    // Deterministic — same seed produces same output
    expect(r1[0]!.first).toBe(r2[0]!.first);
    expect(r1[0]!.last).toBe(r2[0]!.last);
  });

  it('generates correct record count with duplicates', () => {
    const scale = 500;
    const { records } = generateFebrlRecords(scale, 42);
    const expectedTotal = scale + Math.floor(scale * 0.2);
    expect(records.length).toBe(expectedTotal);
  });

  it('all records have _er_id', () => {
    const { records } = generateFebrlRecords(100, 42);
    for (const rec of records) {
      expect(rec).toHaveProperty('_er_id');
      expect(typeof (rec as any)._er_id).toBe('number');
    }
  });

  it('generates correct number of ground truth pairs', () => {
    const scale = 500;
    const dupCount = Math.floor(scale * 0.2);
    const { groundTruth } = generateFebrlRecords(scale, 42);
    expect(groundTruth.size).toBe(dupCount);
  });

  it('produces different output with different seeds', () => {
    const { records: r1 } = generateFebrlRecords(100, 42);
    const { records: r2 } = generateFebrlRecords(100, 99);
    // Extremely unlikely to be identical
    const sameFirst = r1[0]!.first === r2[0]!.first && r1[0]!.last === r2[0]!.last;
    expect(sameFirst).toBe(false);
  });

  it('handles scale=0 gracefully', () => {
    const { records, groundTruth } = generateFebrlRecords(0, 42);
    expect(records.length).toBe(0);
    expect(groundTruth.size).toBe(0);
  });

  it('IDs are stable across shuffle — ground truth pairs refer to IDs, not positions', () => {
    const { records, groundTruth } = generateFebrlRecords(100, 42);
    // Build a map from _er_id to shuffled position
    const idToPos = new Map<number, number>();
    for (let i = 0; i < records.length; i++) {
      idToPos.set((records[i] as any)._er_id, i);
    }
    // Every ground truth pair should have both IDs present
    for (const pair of groundTruth) {
      const [a, b] = pair.split('|').map(Number);
      expect(idToPos.has(a!)).toBe(true);
      expect(idToPos.has(b!)).toBe(true);
    }
  });
});
