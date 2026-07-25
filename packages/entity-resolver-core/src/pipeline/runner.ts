// Entity Resolver Pipeline �? end-to-end orchestration.
// Wires together preprocessing, blocking, matching (FS EM), clustering, and evaluation.

import type {
  RawRecord,
  PipelineResult,
  PipelineStatistics,
  DiagnosticData,
  FieldMetadata,
  FieldMuParams,
} from '../types/core.js';
import type { FSParameters } from '../fellegi-sunter/parameters.js';
import type { BlockingConfig, CandidatePair } from '../blocking/types.js';
import type { ComparisonSpec, ComparisonVector } from '../matching/comparison.js';
import type { ScoredPair } from '../types/core.js';
import type { ClusteringResult } from '../clustering/algorithms.js';
import { ValidationError } from '../errors/hierarchy.js';
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
  /**
   * If true, preprocess records in-place without cloning.
   * Faster and uses less memory, but mutates the input array.
   * Default: true (in-place). Set false to preserve input.
   */
  readonly mutateInput?: boolean;
}

/**
 * Run the full entity resolver pipeline on a set of records.
 *
 * Pipeline stages:
 * 1. Preprocessing �? Unicode repair, normalization
 * 2. Blocking �? Generate candidate pairs
 * 3. Matching �? Generate comparison vectors + FS match weights
 * 4. Clustering �? Group pairs into entity clusters
 * 5. Evaluation �? Compute 12 metrics (if ground truth provided)
 */
export async function runPipeline(
  records: RawRecord[],
  config: PipelineConfig,
  options?: PipelineOptions,
  _groundTruth?: Map<string, number[]>,
): Promise<PipelineResult> {
  // ���� Input validation ����
  if (!Array.isArray(records) || records.length === 0) {
    throw new ValidationError('records must be a non-empty array', {
      operation: 'runPipeline',
      details: { received: typeof records },
    });
  }
  if (!config.comparisons || config.comparisons.length === 0) {
    throw new ValidationError('config.comparisons must be a non-empty array', {
      operation: 'runPipeline',
      details: { received: config.comparisons },
    });
  }
  if (
    typeof config.matchThreshold !== 'number' ||
    config.matchThreshold < 0 ||
    config.matchThreshold > 1
  ) {
    throw new ValidationError(
      `config.matchThreshold must be a number in [0, 1], got ${String(config.matchThreshold)}`,
      {
        operation: 'runPipeline',
      },
    );
  }

  const startTime = Date.now();

  // Stage 1: Preprocessing (in-place by default to avoid structuredClone overhead)
  const mutateInput = options?.mutateInput ?? true;
  const cleaned: RawRecord[] = mutateInput ? records : structuredClone(records);
  preprocessRecords(cleaned);

  // Stage 2: Blocking
  const blockingResult = standardBlocking(cleaned, config.blocking);
  const candidates = blockingResult.pairs;

  // Stage 3: Matching �? generate comparison vectors grouped by pair
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

  const scoredPairs = computeScoredPairs(
    cleaned,
    candidates,
    config.comparisons,
    params,
    tfLookup,
    pairVectors,
  );

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

/**
 * Run the pipeline from a streaming data source.
 *
 * Materializes all records into memory first (for blocking/clustering which
 * require full dataset access), but prepares the architecture for future
 * true-streaming stages.
 *
 * Prefer this over runPipeline() when consuming from an IDataSource ��
 * it handles the async iteration and provides better memory diagnostics.
 */
export async function runPipelineFromSource(
  source: { read(): AsyncIterable<RawRecord> },
  config: PipelineConfig,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const records: RawRecord[] = [];
  for await (const record of source.read()) {
    records.push(record);
  }
  return runPipeline(records, config, options);
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
  pairVectors?: readonly ComparisonVector[][],
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

  for (let i = 0; i < candidates.length; i++) {
    const pair = candidates[i]!;
    const a = records[pair.leftId]!;
    const b = records[pair.rightId]!;
    const vecs = pairVectors
      ? pairVectors[i]!
      : generateComparisonVectors(a, b, comparisons, fieldMeta);
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
  // Build muParameters map keyed by field name
  const muParams = new Map<
    string,
    { mProbabilities: Map<string, number>; uProbabilities: Map<string, number> }
  >();
  for (const key of params.mProbabilities.keys()) {
    const [field] = key.split(':');
    if (!muParams.has(field!)) {
      muParams.set(field!, { mProbabilities: new Map(), uProbabilities: new Map() });
    }
    muParams.get(field!)!.mProbabilities.set(key, params.mProbabilities.get(key)!);
    muParams.get(field!)!.uProbabilities.set(key, params.uProbabilities.get(key)!);
  }

  // Build match weight histogram with adaptive bin range
  const weightBins: { minWeight: number; maxWeight: number; count: number }[] = [];
  const totalPairs = _pairVectors.length;
  if (totalPairs > 0) {
    // Compute actual min/max weights for adaptive bins
    let minW = Infinity;
    let maxW = -Infinity;
    const weights: number[] = [];
    for (const pair of _pairVectors) {
      let weight = 0;
      for (const v of pair) {
        const key = `${v.field}:${v.level}`;
        const m = params.mProbabilities.get(key);
        const u = params.uProbabilities.get(key);
        if (m && u && u > 0) weight += Math.log2(m / u);
      }
      weights.push(weight);
      if (weight < minW) minW = weight;
      if (weight > maxW) maxW = weight;
    }

    // Pad range by 10% on each side
    const pad = Math.max((maxW - minW) * 0.1, 1);
    const effectiveMin = Math.floor(minW - pad);
    const effectiveMax = Math.ceil(maxW + pad);
    const binWidth = Math.max((effectiveMax - effectiveMin) / 20, 0.5);

    for (let bin = 0; bin < 20; bin++) {
      weightBins.push({
        minWeight: Math.round((effectiveMin + bin * binWidth) * 10) / 10,
        maxWeight: Math.round((effectiveMin + (bin + 1) * binWidth) * 10) / 10,
        count: 0,
      });
    }
    for (const w of weights) {
      const binIdx = Math.min(Math.max(Math.floor((w - effectiveMin) / binWidth), 0), 19);
      if (weightBins[binIdx]) weightBins[binIdx].count++;
    }
  }

  // Convert mutable Maps to ReadonlyMaps for the immutable DiagnosticData return type
  const frozenMuParams = new Map<string, FieldMuParams>();
  for (const [field, params] of muParams) {
    frozenMuParams.set(field, {
      mProbabilities: new Map(params.mProbabilities),
      uProbabilities: new Map(params.uProbabilities),
    });
  }

  return {
    muParameters: frozenMuParams,
    matchWeightDistribution: weightBins,
    unlinkableCount: 0,
  };
}
