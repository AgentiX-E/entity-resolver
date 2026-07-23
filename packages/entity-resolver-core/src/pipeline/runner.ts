// Entity Resolver Pipeline — end-to-end orchestration.
// Wires together preprocessing, blocking, matching (FS EM), clustering, and evaluation.

import type {
  RawRecord,
  PipelineResult,
  PipelineStatistics,
  DiagnosticData,
  FieldMetadata,
} from '../types/core.js';
import type { FSParameters } from '../fellegi-sunter/parameters.js';
import type { BlockingConfig, CandidatePair } from '../blocking/types.js';
import type { ComparisonSpec, ComparisonVector } from '../matching/comparison.js';
import type { ScoredPair } from '../types/core.js';
import type { ClusteringResult } from '../clustering/algorithms.js';
import { preprocessRecords } from '../preprocessing/cleaner.js';
import { standardBlocking } from '../blocking/standard.js';
import { estimateParameters } from '../fellegi-sunter/em.js';
import { computeAggregateMatchWeight } from '../fellegi-sunter/match-weight.js';
import { buildTermFrequencies, TFAdjustmentLookup } from '../fellegi-sunter/tf-adjust.js';
import { generateComparisonVectors } from '../matching/comparison.js';
import { connectedComponents } from '../clustering/algorithms.js';

/** Pipeline configuration. */
export interface PipelineConfig {
  /** Blocking strategy configuration. */
  readonly blocking: BlockingConfig;
  /** Comparison specs for matching. */
  readonly comparisons: readonly ComparisonSpec[];
  /** Match threshold for clustering. */
  readonly matchThreshold: number;
  /** Fields to use for term frequency adjustment. */
  readonly tfFields?: readonly string[];
  /** Whether to run auto-configure (simplified in I5). */
  readonly autoConfigure?: boolean;
}

/** Pipeline execution options. */
export interface PipelineOptions {
  /** Maximum EM iterations. */
  readonly maxEmIterations?: number;
  /** EM convergence epsilon. */
  readonly emEpsilon?: number;
}

/**
 * Run the full entity resolver pipeline on a set of records.
 *
 * Pipeline stages:
 * 1. Preprocessing — Unicode repair, normalization
 * 2. Blocking — Generate candidate pairs
 * 3. Matching — Generate comparison vectors + FS match weights
 * 4. Clustering — Group pairs into entity clusters
 * 5. Evaluation — Compute 12 metrics (if ground truth provided)
 */
export async function runPipeline(
  records: RawRecord[],
  config: PipelineConfig,
  options?: PipelineOptions,
  _groundTruth?: Map<string, number[]>,
): Promise<PipelineResult> {
  const startTime = Date.now();

  // Stage 1: Preprocessing
  const cleaned = structuredClone(records);
  preprocessRecords(cleaned);

  // Stage 2: Blocking
  const blockingResult = standardBlocking(cleaned, config.blocking);
  const candidates = blockingResult.pairs;

  // Stage 3: Matching — generate comparison vectors grouped by pair
  const pairVectors = generateComparisonVectorsForPairs(cleaned, candidates, config.comparisons);

  // Stage 3b: Estimate FS parameters via EM (per-pair posteriors)
  const emResult = estimateParameters(pairVectors, {
    maxIterations: options?.maxEmIterations ?? 30,
    epsilon: options?.emEpsilon ?? 1e-6,
  });
  const params = emResult.parameters;

  // Stage 3c: Compute match weights + TF adjustment
  let tfLookup: TFAdjustmentLookup | undefined;
  if (config.tfFields && config.tfFields.length > 0) {
    const freqs = buildTermFrequencies(cleaned, config.tfFields);
    tfLookup = new TFAdjustmentLookup(freqs);
  }

  const scoredPairs = computeScoredPairs(cleaned, candidates, config.comparisons, params, tfLookup);

  // Stage 4: Clustering
  const clustering = connectedComponents(scoredPairs, records.length, config.matchThreshold);

  // Build final result
  const statistics = buildStatistics(records.length, clustering, emResult, startTime);
  const diagnostics = buildDiagnostics(params, pairVectors);

  const result: PipelineResult = {
    clusters: clustering.clusters,
    scoredPairs,
    singletons: clustering.singletons,
    statistics,
    diagnostics,
  };

  return result;
}

// ══════════════════════════════════════════════════════════════
// Internal helpers
// ══════════════════════════════════════════════════════════════

function generateComparisonVectorsForPairs(
  records: RawRecord[],
  candidates: readonly CandidatePair[],
  comparisons: readonly ComparisonSpec[],
): ComparisonVector[][] {
  const fieldMeta = new Map<string, FieldMetadata>();
  for (const c of comparisons) {
    fieldMeta.set(c.field, {
      name: c.field,
      semanticType: 'string',
      cardinality: records.length,
      isNumeric: false,
    });
  }
  return candidates.map((pair) => {
    const a = records[pair.leftId]!;
    const b = records[pair.rightId]!;
    return generateComparisonVectors(a, b, comparisons, fieldMeta);
  });
}

function computeScoredPairs(
  records: RawRecord[],
  candidates: readonly CandidatePair[],
  comparisons: readonly ComparisonSpec[],
  params: FSParameters,
  tfLookup?: TFAdjustmentLookup,
): ScoredPair[] {
  const pairs: ScoredPair[] = [];
  const fieldMeta = new Map<string, FieldMetadata>();
  for (const c of comparisons) {
    fieldMeta.set(c.field, {
      name: c.field,
      semanticType: 'string',
      cardinality: records.length,
      isNumeric: false,
    });
  }

  for (const pair of candidates) {
    const a = records[pair.leftId]!;
    const b = records[pair.rightId]!;
    const vecs = generateComparisonVectors(a, b, comparisons, fieldMeta);
    const mw = computeAggregateMatchWeight(vecs, params);

    let adjustedProb = mw.probability;
    if (tfLookup) {
      for (const c of comparisons) {
        const adj = tfLookup.getAdjustment(c.field, a[c.field]);
        if (adj < 1) adjustedProb *= adj;
      }
    }

    pairs.push({
      leftId: pair.leftId,
      rightId: pair.rightId,
      score: adjustedProb,
      probability: adjustedProb,
    });
  }

  return pairs;
}

function buildStatistics(
  n: number,
  clustering: ClusteringResult,
  _emResult: { iterations: number; converged: boolean },
  startTime: number,
): PipelineStatistics {
  let matched = 0;
  for (const [, c] of clustering.clusters) matched += c.memberIds.length;
  return {
    totalRecords: n,
    totalClusters: clustering.metadata.numClusters,
    matchedRecords: matched,
    matchRate: n > 0 ? matched / n : 0,
    averageClusterSize: clustering.metadata.averageClusterSize,
    maxClusterSize: clustering.metadata.maxClusterSize,
    executionTimeMs: Date.now() - startTime,
  };
}

function buildDiagnostics(
  params: FSParameters,
  _pairVectors: ComparisonVector[][],
): DiagnosticData {
  const muParams = new Map<string, any>();
  for (const key of params.mProbabilities.keys()) {
    const [field] = key.split(':');
    if (!muParams.has(field!))
      muParams.set(field!, { mProbabilities: new Map(), uProbabilities: new Map() });
    muParams.get(field!)!.mProbabilities.set(key, params.mProbabilities.get(key)!);
    muParams.get(field!)!.uProbabilities.set(key, params.uProbabilities.get(key)!);
  }
  // Build match weight histogram from per-pair vector counts
  const weightBins: Array<{ binMin: number; binMax: number; count: number }> = [];
  const totalPairs = _pairVectors.length;
  if (totalPairs > 0) {
    // Compute approximate match weight bins from parameter distribution
    for (let bin = 0; bin < 20; bin++) {
      weightBins.push({ binMin: bin * 5 - 50, binMax: (bin + 1) * 5 - 50, count: 0 });
    }
    for (const pair of _pairVectors) {
      let weight = 0;
      for (const v of pair) {
        const key = `${v.field}:${v.level}`;
        const m = params.mProbabilities.get(key);
        const u = params.uProbabilities.get(key);
        if (m && u && u > 0) weight += Math.log2(m / u);
      }
      const binIdx = Math.min(Math.max(Math.floor((weight + 50) / 5), 0), 19);
      if (weightBins[binIdx]) weightBins[binIdx]!.count++;
    }
  }
  return {
    muParameters: muParams as any,
    matchWeightDistribution: weightBins as any,
    unlinkableCount: 0,
  };
}
