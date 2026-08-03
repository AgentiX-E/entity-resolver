/**
 * Interactive diagnostics for entity-resolver pipelines (I39).
 *
 * Inspired by Splink's Vega-Lite charting system: generates structured
 * JSON data suitable for rendering as waterfall charts, ROC curves,
 * and m/u parameter visualizations in any frontend framework.
 *
 * All generators are pure functions — they take pipeline results and
 * return JSON-serializable data. No rendering logic is coupled to
 * the data generation.
 */

import type { ScoredPair } from '../types/core.js';
import type { ComparisonSpec, ComparisonVector } from '../matching/comparison.js';
import type { FSParameters } from '../fellegi-sunter/parameters.js';

// ═══════════════════════════════════════════════════════════════
// Waterfall chart — per-pair match weight breakdown
// ═══════════════════════════════════════════════════════════════

/** A single bar in the waterfall chart representing one field's contribution. */
export interface WaterfallBar {
  /** Field name. */
  readonly field: string;
  /** Match weight contributed by this field (positive = match, negative = non-match). */
  readonly weight: number;
  /** The comparison level reached (e.g., "strong_match", "not_match"). */
  readonly level: string;
  /** Raw similarity score for this field [0, 1]. */
  readonly rawScore: number;
  /** Cumulative weight after this field. */
  readonly cumulative: number;
}

/** Complete waterfall chart data for a single record pair. */
export interface WaterfallChart {
  /** Left record index. */
  readonly leftId: number;
  /** Right record index. */
  readonly rightId: number;
  /** Final total match weight. */
  readonly totalWeight: number;
  /** Per-field breakdown bars. */
  readonly bars: readonly WaterfallBar[];
  /** Whether this pair is classified as a match at the configured threshold. */
  readonly isMatch: boolean;
}

/**
 * Generate waterfall chart data for a scored record pair.
 *
 * Shows how each field contributed to the final match weight,
 * enabling users to understand exactly why two records matched
 * (or didn't match).
 */
export function buildWaterfallChart(
  leftId: number,
  rightId: number,
  vectors: readonly ComparisonVector[],
  params: FSParameters,
  matchThreshold: number,
): WaterfallChart {
  let cumulative = 0;
  const bars: WaterfallBar[] = [];

  for (const v of vectors) {
    const key = `${v.field}:${v.level}`;
    const mProb = params.mProbabilities.get(key) ?? 0.9;
    const uProb = params.uProbabilities.get(key) ?? 0.1;

    // Match weight = log2(m/u) — applied uniformly for all levels.
    // The Fellegi-Sunter model uses log2(m_l / u_l) for observation l,
    // regardless of whether l is a "match" or "not_match" level.
    const weight = Math.log2(mProb / uProb);

    cumulative += weight;

    bars.push({
      field: v.field,
      weight: Math.round(weight * 1000) / 1000,
      level: v.level,
      rawScore: v.score,
      cumulative: Math.round(cumulative * 1000) / 1000,
    });
  }

  return {
    leftId,
    rightId,
    totalWeight: Math.round(cumulative * 1000) / 1000,
    bars,
    isMatch: cumulative >= matchThreshold,
  };
}

// ═══════════════════════════════════════════════════════════════
// ROC curve — threshold sweep analysis
// ═══════════════════════════════════════════════════════════════

/** A single point on the ROC/PR curve. */
export interface CurvePoint {
  /** Threshold value. */
  readonly threshold: number;
  /** True positive rate at this threshold. */
  readonly truePositiveRate: number;
  /** False positive rate at this threshold. */
  readonly falsePositiveRate: number;
  /** Precision at this threshold. */
  readonly precision: number;
  /** Recall at this threshold. */
  readonly recall: number;
  /** F1 score at this threshold. */
  readonly f1: number;
  /** Number of true positives. */
  readonly truePositives: number;
  /** Number of false positives. */
  readonly falsePositives: number;
}

/** Complete ROC/PR curve with AUC computation. */
export interface ROCCurve {
  /** All curve points across the threshold sweep. */
  readonly points: readonly CurvePoint[];
  /** Area Under the ROC Curve (AUC-ROC). */
  readonly aucROC: number;
  /** Area Under the Precision-Recall Curve (AUC-PR). */
  readonly aucPR: number;
  /** Optimal threshold (maximizes F1). */
  readonly optimalThreshold: number;
  /** F1 at optimal threshold. */
  readonly optimalF1: number;
}

/**
 * Compute ROC and Precision-Recall curves from scored pairs.
 *
 * Sweeps match probability thresholds from 0.0 to 1.0 and computes
 * classification metrics at each point against ground truth.
 */
export function computeROCCurve(
  pairs: readonly ScoredPair[],
  groundTruth: Set<string>,
  leftIds: readonly string[],
  rightIds: readonly string[],
): ROCCurve {
  if (pairs.length === 0) {
    return {
      points: [],
      aucROC: 0,
      aucPR: 0,
      optimalThreshold: 0.5,
      optimalF1: 0,
    };
  }

  // Sort pairs by score descending for efficient sweep
  const sorted = [...pairs].sort((a, b) => {
    const sa = a.probability ?? a.score;
    const sb = b.probability ?? b.score;
    return sb - sa;
  });

  const totalPositives = groundTruth.size;
  const totalNegatives = sorted.length - totalPositives;

  const points: CurvePoint[] = [];

  // Sweep: at each unique score, compute metrics
  const uniqueScores = [...new Set(sorted.map((p) => p.probability ?? p.score))].sort(
    (a, b) => b - a,
  );

  for (const threshold of uniqueScores) {
    let tp = 0;
    let fp = 0;

    for (const pair of sorted) {
      const score = pair.probability ?? pair.score;
      if (score < threshold) break;
      const lid = leftIds[pair.leftId] ?? String(pair.leftId);
      const rid = rightIds[pair.rightId] ?? String(pair.rightId);
      if (groundTruth.has(`${lid}|${rid}`)) {
        tp++;
      } else {
        fp++;
      }
    }

    const tpr = totalPositives > 0 ? tp / totalPositives : 1;
    const fpr = totalNegatives > 0 ? fp / totalNegatives : 0;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
    const recall = tpr;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    points.push({
      threshold: Math.round(threshold * 1000) / 1000,
      truePositiveRate: Math.round(tpr * 10000) / 10000,
      falsePositiveRate: Math.round(fpr * 10000) / 10000,
      precision: Math.round(precision * 10000) / 10000,
      recall: Math.round(recall * 10000) / 10000,
      f1: Math.round(f1 * 10000) / 10000,
      truePositives: tp,
      falsePositives: fp,
    });
  }

  // Sort by threshold ascending
  points.sort((a, b) => a.threshold - b.threshold);

  // AUC-ROC: trapezoidal integration
  let aucROC = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    aucROC += (prev.falsePositiveRate + curr.falsePositiveRate) / 2 *
      (curr.truePositiveRate - prev.truePositiveRate);
  }
  aucROC = Math.abs(aucROC);

  // AUC-PR: average precision
  let aucPR = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    aucPR += (prev.precision + curr.precision) / 2 *
      Math.abs(curr.recall - prev.recall);
  }

  // Optimal threshold: max F1
  let optimal = points[0]!;
  for (const p of points) {
    if (p.f1 > optimal.f1) optimal = p;
  }

  return {
    points,
    aucROC: Math.round(Math.abs(aucROC) * 10000) / 10000,
    aucPR: Math.round(aucPR * 10000) / 10000,
    optimalThreshold: optimal.threshold,
    optimalF1: optimal.f1,
  };
}

// ═══════════════════════════════════════════════════════════════
// M/U parameter chart data
// ═══════════════════════════════════════════════════════════════

/** A single m/u parameter pair for a comparison level. */
export interface MUPoint {
  /** Comparison key in "field:level" format. */
  readonly key: string;
  /** Field name. */
  readonly field: string;
  /** Comparison level name. */
  readonly level: string;
  /** m-probability: P(observation | records match). */
  readonly mProbability: number;
  /** u-probability: P(observation | records do not match). */
  readonly uProbability: number;
  /** Match weight contribution: log2(m/u). */
  readonly matchWeight: number;
}

/**
 * Extract m/u parameter data for visualization.
 *
 * Converts internal FSParameters to a format suitable for
 * rendering as a dual-axis bar chart or scatter plot.
 */
export function extractMUParameters(
  params: FSParameters,
  comparisons: readonly ComparisonSpec[],
): readonly MUPoint[] {
  const points: MUPoint[] = [];

  for (const comp of comparisons) {
    for (const level of comp.levels) {
      const key = `${comp.field}:${level.label}`;
      const mProb = params.mProbabilities.get(key) ?? 0.9;
      const uProb = params.uProbabilities.get(key) ?? 0.1;

      points.push({
        key,
        field: comp.field,
        level: level.label,
        mProbability: Math.round(mProb * 10000) / 10000,
        uProbability: Math.round(uProb * 10000) / 10000,
        matchWeight: Math.round(Math.log2(mProb / uProb) * 1000) / 1000,
      });
    }
  }

  return points;
}

// ═══════════════════════════════════════════════════════════════
// Enhanced TF adjustment with configurable floor (I39)
// ═══════════════════════════════════════════════════════════════

/** Configuration for term frequency adjustment. */
export interface TFAdjustmentConfig {
  /** Minimum u-value floor — prevents over-adjustment for extremely rare values.
   *  Splink default: 1e-6. Default: 1e-6. */
  readonly minUValue?: number;
  /** Adjustment floor — minimum multiplier applied to weights.
   *  Values below this are clamped. Default: 0.01 (1% of original weight). */
  readonly floor?: number;
  /** Whether to use GREATEST(tf_l, tf_r) — Splink's approach of using
   *  the MORE common value for the adjustment. Default: true. */
  readonly useGreatest?: boolean;
}

/**
 * Compute TF adjustment with configurable floor and minimum u-value.
 *
 * Splink-equivalent formula:
 *   adjusted_u = max(min_u, u_prob * (1 + tf_weight * log10(GREATEST(tf_l, tf_r) / N)))
 *   adjusted_mw = log2(m / adjusted_u)
 *
 * This prevents over-adjustment for values with very low frequency
 * while still penalizing extremely common values like "Smith".
 *
 * @param leftFreq — frequency of the value in the left dataset
 * @param rightFreq — frequency of the value in the right dataset
 * @param totalRecords — total number of records
 * @param baseU — base u-probability before adjustment
 * @param config — adjustment configuration
 */
export function computeTFAdjustmentSplink(
  leftFreq: number,
  rightFreq: number,
  totalRecords: number,
  baseU: number,
  config: TFAdjustmentConfig = {},
): number {
  const minU = config.minUValue ?? 1e-6;
  const floor = config.floor ?? 0.01;
  const useGreatest = config.useGreatest ?? true;

  // Pick the more common value (Splink's GREATESR(tf_l, tf_r))
  const freq = useGreatest ? Math.max(leftFreq, rightFreq) : leftFreq;

  if (freq <= 0 || totalRecords <= 0) return 1.0;

  const freqRatio = freq / totalRecords;
  const tfFactor = 1 + Math.log10(Math.max(freqRatio, minU));

  // adjusted_u = max(min_u, u * tf_factor)
  const adjustedU = Math.max(minU, baseU * Math.max(tfFactor, floor));

  // Return the adjustment multiplier: adjusted_u / base_u
  return baseU > 0 ? Math.max(floor, adjustedU / baseU) : 1.0;
}
