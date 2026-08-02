/**
 * Classification metrics with scientific rigor:
 * - F1, Precision, Recall via ground-truth comparison
 * - McNemar's test for pairwise statistical significance
 * - Clopper-Pearson binomial confidence intervals
 */
import type { ClassificationMetrics, AggregatedMetrics, MatchPair } from './types.js';

import * as fs from 'node:fs';

/** Parse the perfect mapping CSV into a set of "leftId|rightId" pairs. */
export function loadGroundTruth(mappingPath: string, delimiter = ','): Set<string> {
  const raw = fs.readFileSync(mappingPath, 'utf-8');
  const lines = raw.trim().split('\n');
  const truth = new Set<string>();

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(delimiter);
    if (parts.length < 2) continue;
    const left = parts[0]!.trim().replace(/"/g, '');
    const right = parts[1]!.trim().replace(/"/g, '');
    if (left && right) truth.add(`${left}|${right}`);
  }

  return truth;
}

/**
 * Compute classification metrics for a set of predicted pairs against
 * ground truth. Uses ID-based matching where pairs[p].leftId/rightId
 * are indices into the left/right record arrays.
 */
export function computeMetrics(
  pairs: MatchPair[],
  groundTruth: Set<string>,
  leftIds: string[],
  rightIds: string[],
  threshold: number,
): ClassificationMetrics {
  const predicted = new Set<string>();

  for (const pair of pairs) {
    const effectiveScore = pair.probability ?? pair.score;
    if (effectiveScore >= threshold) {
      const lId = leftIds[pair.leftId] ?? String(pair.leftId);
      const rId = rightIds[pair.rightId] ?? String(pair.rightId);
      predicted.add(`${lId}|${rId}`);
    }
  }

  let tp = 0;
  for (const p of predicted) {
    if (groundTruth.has(p)) tp++;
  }

  const fp = predicted.size - tp;
  const fn = groundTruth.size - tp;

  return {
    precision: predicted.size > 0 ? tp / predicted.size : 0,
    recall: groundTruth.size > 0 ? tp / groundTruth.size : 0,
    f1: tp > 0 ? (2 * tp) / (2 * tp + fp + fn) : 0,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    predictedPairs: predicted.size,
    truePairs: groundTruth.size,
  };
}

/** Aggregate metrics from N repeated runs into mean ± stdDev. */
export function aggregateMetrics(runs: ClassificationMetrics[]): AggregatedMetrics {
  const n = runs.length;
  if (n === 0) {
    return {
      precision: 0, recall: 0, f1: 0,
      truePositives: 0, falsePositives: 0, falseNegatives: 0,
      predictedPairs: 0, truePairs: 0,
      f1StdDev: 0, precisionStdDev: 0, recallStdDev: 0,
      runs: 0, f1Values: [],
    };
  }

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const mean = (arr: number[]) => sum(arr) / arr.length;
  const stdDev = (arr: number[], m: number) => {
    if (arr.length < 2) return 0;
    const variance = sum(arr.map((x) => (x - m) ** 2)) / (arr.length - 1);
    return Math.sqrt(variance);
  };

  const f1s = runs.map((r) => r.f1);
  const ps = runs.map((r) => r.precision);
  const rs = runs.map((r) => r.recall);

  const mF1 = mean(f1s);
  const mP = mean(ps);
  const mR = mean(rs);

  return {
    precision: mP,
    recall: mR,
    f1: mF1,
    truePositives: Math.round(mean(runs.map((r) => r.truePositives))),
    falsePositives: Math.round(mean(runs.map((r) => r.falsePositives))),
    falseNegatives: Math.round(mean(runs.map((r) => r.falseNegatives))),
    predictedPairs: Math.round(mean(runs.map((r) => r.predictedPairs))),
    truePairs: runs[0]!.truePairs,
    f1StdDev: stdDev(f1s, mF1),
    precisionStdDev: stdDev(ps, mP),
    recallStdDev: stdDev(rs, mR),
    runs: n,
    f1Values: f1s,
  };
}

/**
 * McNemar's test for paired nominal data.
 * Tests whether two classifiers have the same error rate.
 * Returns a p-value (two-sided, with continuity correction).
 *
 * Reference: McNemar (1947), "Note on the sampling error of the
 * difference between correlated proportions or percentages."
 */
export function mcnemarTest(
  predA: Set<string>,
  predB: Set<string>,
  groundTruth: Set<string>,
): { statistic: number; pValue: number; significant: boolean } {
  // Build contingency table
  let b = 0; // A wrong, B correct
  let c = 0; // A correct, B wrong

  const allSamples = new Set([...predA, ...predB]);
  for (const sample of allSamples) {
    const aCorrect = groundTruth.has(sample) === predA.has(sample);
    const bCorrect = groundTruth.has(sample) === predB.has(sample);
    if (aCorrect && !bCorrect) c++;
    if (!aCorrect && bCorrect) b++;
  }

  // McNemar statistic with Yates continuity correction
  const statistic = b + c > 0
    ? ((Math.abs(b - c) - 1) ** 2) / (b + c)
    : 0;

  // Chi-square 1-df p-value approximation
  const pValue = 1 - chi2Cdf(statistic, 1);

  return {
    statistic: Math.round(statistic * 1e4) / 1e4,
    pValue: Math.round(pValue * 1e4) / 1e4,
    significant: pValue < 0.05,
  };
}

/** Chi-square CDF approximation (Wilson-Hilferty). */
function chi2Cdf(x: number, df: number): number {
  if (x <= 0) return 0;
  const z = ((x / df) ** (1 / 3) - 1 + 2 / (9 * df)) / Math.sqrt(2 / (9 * df));
  return normalCdf(z);
}

/** Standard normal CDF approximation (Abramowitz & Stegun 26.2.17). */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}
