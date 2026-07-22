// Layer 1: Data API — pure JSON diagnostic data builders.
// Framework-agnostic, zero rendering dependencies.
// Consumers render with D3, ECharts, Chart.js, Recharts, or any charting library.

import type {
  PipelineResult,
  MatchWeightBin,
  FieldMuParams,
  DiagnosticData,
} from '@agentix-e/entity-resolution-core';

// ══════════════════════════════════════════════════════════════
// Waterfall Chart Data
// ══════════════════════════════════════════════════════════════

/** A single bar in the waterfall chart. */
export interface WaterfallBar {
  readonly label: string;
  readonly weight: number;
  readonly cumulative: number;
  readonly valueA: string;
  readonly valueB: string;
  readonly comparisonLevel: string;
}

/** Complete waterfall chart data for a record pair. */
export interface WaterfallChartData {
  readonly recordPair: { readonly idA: number; readonly idB: number };
  readonly priorWeight: number;
  readonly bars: readonly WaterfallBar[];
  readonly totalWeight: number;
  readonly matchProbability: number;
}

/**
 * Build waterfall chart data from a pipeline result.
 * Shows how each field contributes to the total match weight.
 */
export function buildWaterfallData(result: PipelineResult, pairIndex: number): WaterfallChartData {
  const pair = result.scoredPairs[pairIndex];
  if (!pair) {
    return {
      recordPair: { idA: -1, idB: -1 },
      priorWeight: 0,
      bars: [],
      totalWeight: 0,
      matchProbability: 0,
    };
  }

  // Build bars from diagnostic data
  const bars: WaterfallBar[] = [];
  let cumulative = 0;

  for (const [field, params] of result.diagnostics.muParameters) {
    for (const [level, m] of params.mProbabilities) {
      const u = params.uProbabilities.get(level);
      if (u !== undefined && m > 0 && u > 0) {
        const weight = Math.log2(m / u);
        cumulative += weight;
        bars.push({
          label: `${field}:${level}`,
          weight,
          cumulative,
          valueA: field,
          valueB: field,
          comparisonLevel: level,
        });
      }
    }
  }

  return {
    recordPair: { idA: pair.leftId, idB: pair.rightId },
    priorWeight: 0,
    bars,
    totalWeight: bars.reduce((s, b) => s + b.weight, 0),
    matchProbability: pair.probability ?? pair.score,
  };
}

// ══════════════════════════════════════════════════════════════
// Histogram Data
// ══════════════════════════════════════════════════════════════

/** A histogram bin for match weight distribution. */
export interface HistogramBin {
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly count: number;
}

/** Complete histogram data. */
export interface HistogramData {
  readonly bins: readonly HistogramBin[];
  readonly threshold?: number;
  readonly summary: {
    readonly totalPairs: number;
    readonly aboveThreshold: number;
    readonly belowThreshold: number;
  };
}

/**
 * Build match weight histogram data from pipeline diagnostics.
 */
export function buildHistogramData(result: PipelineResult, threshold?: number): HistogramData {
  const distribution: MatchWeightBin[] =
    result.diagnostics.matchWeightDistribution.length > 0
      ? result.diagnostics.matchWeightDistribution
      : buildDefaultBins(result);

  const totalPairs = distribution.reduce((s, b) => s + b.count, 0);
  const t = threshold ?? 0;

  let above = 0;
  let below = 0;
  for (const bin of distribution) {
    if (bin.minWeight >= t) {
      above += bin.count;
    } else if (bin.maxWeight <= t) {
      below += bin.count;
    } else {
      // Overlapping bin — split proportionally
      const range = bin.maxWeight - bin.minWeight;
      const aboveFrac = range > 0 ? (bin.maxWeight - t) / range : 0;
      above += Math.round(bin.count * aboveFrac);
      below += bin.count - Math.round(bin.count * aboveFrac);
    }
  }

  return {
    bins: distribution.map((b) => ({
      minWeight: b.minWeight,
      maxWeight: b.maxWeight,
      count: b.count,
    })),
    threshold: t,
    summary: { totalPairs, aboveThreshold: above, belowThreshold: below },
  };
}

function buildDefaultBins(result: PipelineResult): MatchWeightBin[] {
  const weights = result.scoredPairs.map((p) =>
    Math.log2((p.probability ?? p.score) / (1 - (p.probability ?? p.score))),
  );

  if (weights.length === 0) return [];

  const minW = Math.floor(Math.min(...weights));
  const maxW = Math.ceil(Math.max(...weights));
  const binWidth = Math.max(1, Math.ceil((maxW - minW) / 20));
  const bins: MatchWeightBin[] = [];

  for (let w = minW; w < maxW; w += binWidth) {
    const count = weights.filter((x) => x >= w && x < w + binWidth).length;
    bins.push({ minWeight: w, maxWeight: w + binWidth, count });
  }

  return bins;
}

// ══════════════════════════════════════════════════════════════
// m/u Parameter Chart Data
// ══════════════════════════════════════════════════════════════

/** A single field's m/u parameters. */
export interface MuFieldData {
  readonly field: string;
  readonly levels: readonly MuLevelData[];
}

/** Parameters for one comparison level. */
export interface MuLevelData {
  readonly label: string;
  readonly mProbability: number;
  readonly uProbability: number;
  readonly weight: number;
}

/** Complete m/u chart data. */
export interface MuChartData {
  readonly fields: readonly MuFieldData[];
  readonly lambda: number;
}

/**
 * Build m/u parameter chart data from pipeline diagnostics.
 */
export function buildMuChartData(result: PipelineResult, lambda?: number): MuChartData {
  const fields: MuFieldData[] = [];

  for (const [field, params] of result.diagnostics.muParameters) {
    const levels: MuLevelData[] = [];
    for (const [level, m] of params.mProbabilities) {
      const u = params.uProbabilities.get(level);
      levels.push({
        label: level,
        mProbability: m,
        uProbability: u ?? 0,
        weight: u !== undefined && u > 0 ? Math.log2(m / u) : 0,
      });
    }
    if (levels.length > 0) {
      fields.push({ field, levels });
    }
  }

  return { fields, lambda: lambda ?? 0.001 };
}

// ══════════════════════════════════════════════════════════════
// Cluster Explorer Data
// ══════════════════════════════════════════════════════════════

/** Tree node for cluster exploration. */
export interface ClusterTreeNode {
  readonly id: string;
  readonly label: string;
  readonly size: number;
  readonly cohesion: number;
  readonly children: readonly ClusterTreeNode[];
}

/** Complete cluster explorer data. */
export interface ClusterExplorerData {
  readonly tree: ClusterTreeNode;
  readonly totalClusters: number;
  readonly totalRecords: number;
  readonly singletonCount: number;
}

/** A summary of a single record for display in cluster view. */
export interface RecordSummary {
  readonly id: number;
  readonly fields: Readonly<Record<string, unknown>>;
}

/**
 * Build cluster tree data for interactive exploration.
 */
export function buildClusterData(
  result: PipelineResult,
  _records?: ReadonlyArray<Record<string, unknown>>,
): ClusterExplorerData {
  const children: ClusterTreeNode[] = [];

  for (const [cid, cluster] of result.clusters) {
    children.push({
      id: cid,
      label: `Cluster ${cid}`,
      size: cluster.memberIds.length,
      cohesion: cluster.cohesion,
      children: cluster.memberIds.map((mid) => ({
        id: `${cid}_${mid}`,
        label: `Record ${mid}`,
        size: 1,
        cohesion: 1,
        children: [],
      })),
    });
  }

  return {
    tree: {
      id: 'root',
      label: 'All Clusters',
      size: result.statistics.totalRecords,
      cohesion: 0,
      children,
    },
    totalClusters: result.clusters.size,
    totalRecords: result.statistics.totalRecords,
    singletonCount: result.singletons.length,
  };
}

// ══════════════════════════════════════════════════════════════
// Evaluation Radar / Summary Data
// ══════════════════════════════════════════════════════════════

/** Single axis in the evaluation radar chart. */
export interface EvaluationAxis {
  readonly name: string;
  readonly value: number;
  readonly maxValue: number;
}

/** Complete evaluation visualization data. */
export interface EvaluationRadarData {
  readonly axes: readonly EvaluationAxis[];
}

/**
 * Build 12-axis evaluation radar chart data from evaluation metrics.
 */
export function buildEvaluationData(metrics: {
  pairwisePrecision: number;
  pairwiseRecall: number;
  pairwiseF1: number;
  clusterPrecision: number;
  clusterRecall: number;
  clusterF1: number;
  bCubedPrecision: number;
  bCubedRecall: number;
  bCubedF1: number;
  adjustedRandIndex: number;
  fowlkesMallowsIndex: number;
  vMeasure: number;
}): EvaluationRadarData {
  return {
    axes: [
      { name: 'Pairwise P', value: metrics.pairwisePrecision, maxValue: 1 },
      { name: 'Pairwise R', value: metrics.pairwiseRecall, maxValue: 1 },
      { name: 'Pairwise F1', value: metrics.pairwiseF1, maxValue: 1 },
      { name: 'Cluster P', value: metrics.clusterPrecision, maxValue: 1 },
      { name: 'Cluster R', value: metrics.clusterRecall, maxValue: 1 },
      { name: 'Cluster F1', value: metrics.clusterF1, maxValue: 1 },
      { name: 'B³ P', value: metrics.bCubedPrecision, maxValue: 1 },
      { name: 'B³ R', value: metrics.bCubedRecall, maxValue: 1 },
      { name: 'B³ F1', value: metrics.bCubedF1, maxValue: 1 },
      { name: 'ARI', value: metrics.adjustedRandIndex, maxValue: 1 },
      { name: 'FMI', value: metrics.fowlkesMallowsIndex, maxValue: 1 },
      { name: 'V-measure', value: metrics.vMeasure, maxValue: 1 },
    ],
  };
}

// ══════════════════════════════════════════════════════════════
// Unlinkables Analysis Data
// ══════════════════════════════════════════════════════════════

/** Unlinkable record analysis data. */
export interface UnlinkablesData {
  readonly totalRecords: number;
  readonly linkedRecords: number;
  readonly unlinkedRecords: number;
  readonly matchRate: number;
}

/**
 * Build unlinkables analysis from pipeline statistics.
 */
export function buildUnlinkablesData(result: PipelineResult): UnlinkablesData {
  const linked = result.statistics.totalRecords - result.singletons.length;
  return {
    totalRecords: result.statistics.totalRecords,
    linkedRecords: linked,
    unlinkedRecords: result.singletons.length,
    matchRate: result.statistics.matchRate,
  };
}
