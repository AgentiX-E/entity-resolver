// Gazetteer matching — match a set of query records against an indexed record base.
// Record Linking — link records across two different datasets.
//
// Both are stateless pure functions built on the existing pipeline primitives.

import type { RawRecord, ScoredPair, PipelineResult } from '../types/core.js';
import type { ComparisonSpec } from '../matching/comparison.js';
import type { BlockingConfig, CandidatePair } from '../blocking/types.js';
import { preprocessRecords } from '../preprocessing/cleaner.js';
import { generateComparisonVectors } from '../matching/comparison.js';
import { computeAggregateMatchWeight } from '../fellegi-sunter/match-weight.js';
import { estimateParameters } from '../fellegi-sunter/em.js';
import { standardBlocking } from '../blocking/standard.js';
import { connectedComponents } from '../clustering/algorithms.js';

// ─── Gazetteer Matching ──────────────────────────────────────────

/** Configuration for Gazetteer matching. */
export interface GazetteerConfig {
  /** Comparison specs for matching fields. */
  readonly comparisons: readonly ComparisonSpec[];
  /** Match threshold for accepting a pair as a match. */
  readonly matchThreshold: number;
  /** Blocking pass fields (auto-generated if not provided). */
  readonly blockOnFields?: readonly string[];
}

/**
 * Run Gazetteer matching: compare each query record against the index records.
 *
 * Unlike deduplication (O(n²) within one set), Gazetteer matching is O(m × n)
 * where m = queryRecords length and n = indexRecords length. Only cross-set
 * pairs are compared — no within-set pairs.
 *
 * Returns a ranked list of scored pairs from query → index, sorted by score descending.
 */
export async function gazetteerMatch(
  queryRecords: RawRecord[],
  indexRecords: RawRecord[],
  config: GazetteerConfig,
): Promise<PipelineResult & { queryToIndexMatches: ScoredPair[] }> {
  const startTime = Date.now();

  // Preprocess both sets independently
  const queries = structuredClone(queryRecords);
  preprocessRecords(queries);
  const index = structuredClone(indexRecords);
  preprocessRecords(index);

  const allRecords = [...queries, ...index];
  const queryCount = queries.length;
  const indexCount = index.length;
  const totalRecords = queryCount + indexCount;

  // Generate cross-set candidate pairs
  const crossPairs: CandidatePair[] = [];
  for (let qi = 0; qi < queryCount; qi++) {
    for (let ii = 0; ii < indexCount; ii++) {
      crossPairs.push({ leftId: qi, rightId: queryCount + ii });
    }
  }

  // Generate comparison vectors grouped by pair for EM
  const pairVectors = crossPairs.map((pair) => {
    const a = allRecords[pair.leftId]!;
    const b = allRecords[pair.rightId]!;
    return generateComparisonVectors(a, b, config.comparisons, new Map());
  });

  // Estimate FS parameters from cross-set pairs
  const emResult = estimateParameters(pairVectors);
  const params = emResult.parameters;

  // Compute match weights for each cross-set pair
  const scoredPairs: ScoredPair[] = [];
  for (let pi = 0; pi < crossPairs.length; pi++) {
    const pair = crossPairs[pi]!;
    const mw = computeAggregateMatchWeight(pairVectors[pi]!, params);
    scoredPairs.push({
      leftId: pair.leftId,
      rightId: pair.rightId,
      score: mw.probability,
      probability: mw.probability,
    });
  }

  // Filter and sort by score
  const matches = scoredPairs
    .filter((p) => p.score >= config.matchThreshold)
    .sort((a, b) => b.score - a.score);

  // Build clusters from matches
  const clustering = connectedComponents(matches, totalRecords, config.matchThreshold);

  return {
    clusters: clustering.clusters,
    scoredPairs: matches,
    singletons: clustering.singletons,
    queryToIndexMatches: matches,
    statistics: {
      totalRecords,
      totalClusters: clustering.metadata.numClusters,
      matchedRecords: matches.length * 2,
      matchRate: crossPairs.length > 0 ? matches.length / crossPairs.length : 0,
      averageClusterSize: clustering.metadata.averageClusterSize,
      maxClusterSize: clustering.metadata.maxClusterSize,
      executionTimeMs: Date.now() - startTime,
    },
    diagnostics: {
      muParameters: new Map(),
      matchWeightDistribution: [],
      unlinkableCount: crossPairs.length - matches.length,
    },
  };
}

// ─── Record Linking ──────────────────────────────────────────────

/** Configuration for Record Linking. */
export interface RecordLinkConfig {
  /** Comparison specs for matching fields. */
  readonly comparisons: readonly ComparisonSpec[];
  /** Blocking configuration. */
  readonly blocking?: BlockingConfig;
  /** Match threshold for clustering. */
  readonly matchThreshold: number;
}

/**
 * Link records across two datasets (Left and Right).
 *
 * Compares records from dataset A against dataset B using blocking
 * and Fellegi-Sunter matching. Returns cross-set matched pairs and clusters.
 *
 * This is the standard "record linkage" workflow for joining two tables
 * without a common key.
 */
export async function linkRecords(
  leftRecords: RawRecord[],
  rightRecords: RawRecord[],
  config: RecordLinkConfig,
): Promise<PipelineResult & { crossPairs: ScoredPair[] }> {
  const startTime = Date.now();

  const left = structuredClone(leftRecords);
  preprocessRecords(left);
  const right = structuredClone(rightRecords);
  preprocessRecords(right);

  const allRecords = [...left, ...right];
  const leftCount = left.length;
  const totalRecords = leftCount + right.length;

  // Generate candidate pairs via blocking or all cross-set
  let candidates: CandidatePair[];
  if (config.blocking?.passes && config.blocking.passes.length > 0) {
    const blockingResult = standardBlocking(allRecords, config.blocking);
    // Filter to cross-set pairs only
    candidates = blockingResult.pairs.filter(
      (p) =>
        (p.leftId < leftCount && p.rightId >= leftCount) ||
        (p.leftId >= leftCount && p.rightId < leftCount),
    );
  } else {
    // All cross-set pairs (O(m × n))
    candidates = [];
    for (let li = 0; li < leftCount; li++) {
      for (let ri = 0; ri < right.length; ri++) {
        candidates.push({ leftId: li, rightId: leftCount + ri });
      }
    }
  }

  if (candidates.length === 0) {
    return emptyLinkResult(leftCount, right.length, startTime);
  }

  // Group vectors by pair for EM
  const pairVectors = candidates.map((pair) => {
    const a = allRecords[pair.leftId]!;
    const b = allRecords[pair.rightId]!;
    return generateComparisonVectors(a, b, config.comparisons, new Map());
  });

  const emResult = estimateParameters(pairVectors);
  const params = emResult.parameters;

  const scoredPairs: ScoredPair[] = [];
  for (let pi = 0; pi < candidates.length; pi++) {
    const pair = candidates[pi]!;
    const mw = computeAggregateMatchWeight(pairVectors[pi]!, params);
    scoredPairs.push({
      leftId: pair.leftId,
      rightId: pair.rightId,
      score: mw.probability,
      probability: mw.probability,
    });
  }

  const filtered = scoredPairs.filter((p) => p.score >= config.matchThreshold);
  const clustering = connectedComponents(filtered, totalRecords, config.matchThreshold);

  return {
    clusters: clustering.clusters,
    scoredPairs: filtered,
    singletons: clustering.singletons,
    crossPairs: filtered,
    statistics: {
      totalRecords,
      totalClusters: clustering.metadata.numClusters,
      matchedRecords: filtered.length * 2,
      matchRate: candidates.length > 0 ? filtered.length / candidates.length : 0,
      averageClusterSize: clustering.metadata.averageClusterSize,
      maxClusterSize: clustering.metadata.maxClusterSize,
      executionTimeMs: Date.now() - startTime,
    },
    diagnostics: {
      muParameters: new Map(),
      matchWeightDistribution: [],
      unlinkableCount: candidates.length - filtered.length,
    },
  };
}

function emptyLinkResult(leftCount: number, rightCount: number, startTime: number) {
  return {
    clusters: new Map(),
    scoredPairs: [] as ScoredPair[],
    singletons: Array.from({ length: leftCount + rightCount }, (_, i) => i),
    crossPairs: [] as ScoredPair[],
    statistics: {
      totalRecords: leftCount + rightCount,
      totalClusters: 0,
      matchedRecords: 0,
      matchRate: 0,
      averageClusterSize: 0,
      maxClusterSize: 0,
      executionTimeMs: Date.now() - startTime,
    },
    diagnostics: {
      muParameters: new Map(),
      matchWeightDistribution: [],
      unlinkableCount: 0,
    },
  };
}
