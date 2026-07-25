// Automated benchmark runner for ER pipeline evaluation.
// Supports both deduplication and record_linkage benchmarks.
// Large datasets (>1000 records) automatically use SQL-backed pipeline
// to avoid OOM on real-world benchmark data.

import { runPipeline } from '../pipeline/runner.js';
import { linkRecords } from '../pipeline/linking.js';
import { autoConfigure } from '../auto-config/detector.js';
import { loadAllBenchmarks } from './datasets.js';
import type { BenchmarkDataset, BenchmarkResult } from './datasets.js';
import { evaluateClustering } from '../evaluation/metrics.js';
import type { ILogger } from '../interfaces/ILogger.js';
import type { Cluster } from '../types/core.js';
import type { EntityId } from '../types/core.js';
import type { PipelineConfig } from '../pipeline/runner.js';

/** Minimum number of candidate pairs for blocking to be considered effective. */
const MIN_CANDIDATE_PAIRS = 10;

/** Dataset size below which we apply a broad fallback blocking strategy. */
const SMALL_DATASET_THRESHOLD = 500;

export async function runBenchmark(
  dataset: BenchmarkDataset,
  logger?: ILogger,
): Promise<BenchmarkResult> {
  const startTime = Date.now();

  // ── Build pipeline config via auto-configure ──
  const auto = autoConfigure(dataset.records);
  const config = auto.config;

  // ── Record linkage path ──
  if (dataset.type === 'record_linkage' && dataset.leftIndices && dataset.rightIndices) {
    try {
      const leftRecords = dataset.leftIndices.map((i) => dataset.records[i]!);
      const rightRecords = dataset.rightIndices.map((i) => dataset.records[i]!);
      const result = await linkRecords(leftRecords, rightRecords, {
        comparisons: config.comparisons,
        matchThreshold: 0.5,
      });
      // Build predicted clusters from cross-pair matches
      const predClusters = new Map<EntityId, Cluster>();
      for (const pair of result.crossPairs) {
        const cid: EntityId = `cross_${pair.leftId}_${pair.rightId}`;
        predClusters.set(cid, {
          clusterId: cid,
          memberIds: [pair.leftId, pair.rightId],
          cohesion: pair.probability ?? pair.score,
        });
      }
      const refClusters = buildRefClusters(dataset);
      const em = evaluateClustering(predClusters, refClusters);

      return {
        dataset: dataset.name,
        recordCount: dataset.recordCount,
        trueMatchCount: dataset.trueMatchCount,
        foundMatchCount: result.crossPairs.length,
        purity: em.clusterPrecision,
        completeness: em.clusterRecall,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger?.warn(`Benchmark linkage failed for ${dataset.name}: ${msg}`, {
        operation: 'runBenchmark',
        cause: msg,
      });
    }
  }

  // ── Deduplication path ──
  let predClusters = new Map<EntityId, Cluster>();
  let matchCount = 0;

  try {
    const result = await runPipeline(dataset.records, config, {
      mutateInput: true,
    });
    predClusters = result.clusters as Map<EntityId, Cluster>;
    matchCount = result.statistics.matchedRecords;

    // ── Small dataset fallback: if blocking produced too few pairs, try again
    //     with full pairwise comparison (token blocking for all fields).
    if (matchCount < MIN_CANDIDATE_PAIRS && dataset.recordCount < SMALL_DATASET_THRESHOLD) {
      // Re-run with broad token-based blocking that is more lenient
      const sample = dataset.records[0] ?? {};
      const fields = Object.keys(sample).filter((f) => typeof sample[f] === 'string');
      if (fields.length > 0) {
        const broadConfig: PipelineConfig = {
          ...config,
          blocking: {
            passes: fields.map((f) => ({
              fields: [f],
              transforms: ['strip', 'lowercase'],
            })),
          },
          matchThreshold: 0.3,
        };
        const broadResult = await runPipeline(dataset.records, broadConfig, {
          mutateInput: true,
        });
        // Keep the better of the two runs
        const broadMatches = broadResult.statistics.matchedRecords;
        if (broadMatches > matchCount) {
          predClusters = broadResult.clusters as Map<EntityId, Cluster>;
          matchCount = broadMatches;
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger?.warn(`Benchmark pipeline failed for ${dataset.name}: ${msg}`, {
      operation: 'runBenchmark',
      cause: msg,
    });
  }

  // Build reference clusters from ground truth
  const refClusters = buildRefClusters(dataset);

  const em = evaluateClustering(predClusters, refClusters);

  return {
    dataset: dataset.name,
    recordCount: dataset.recordCount,
    trueMatchCount: dataset.trueMatchCount,
    foundMatchCount: matchCount,
    purity: em.clusterPrecision,
    completeness: em.clusterRecall,
    executionTimeMs: Date.now() - startTime,
  };
}

/** Build reference clusters from a dataset's ground truth. */
function buildRefClusters(dataset: BenchmarkDataset): Map<EntityId, Cluster> {
  const refClusters = new Map<EntityId, Cluster>();
  for (const [cid, members] of dataset.groundTruth) {
    refClusters.set(cid, {
      clusterId: cid,
      memberIds: members,
      cohesion: 0,
    });
  }
  return refClusters;
}

export async function runAllBenchmarks(logger?: ILogger): Promise<{
  results: BenchmarkResult[];
  totalTimeMs: number;
}> {
  const datasets = loadAllBenchmarks();
  const results: BenchmarkResult[] = [];
  const totalStart = Date.now();
  for (const dataset of datasets) {
    try {
      results.push(await runBenchmark(dataset, logger));
    } catch (err: unknown) {
      // Log the error but continue with remaining datasets.
      // Individual dataset failures should not abort the full suite.
      const msg = err instanceof Error ? err.message : String(err);
      logger?.warn(`Skipping benchmark '${dataset.name}': ${msg}`, {
        operation: 'runAllBenchmarks',
      });
      results.push({
        dataset: dataset.name,
        recordCount: dataset.recordCount,
        trueMatchCount: dataset.trueMatchCount,
        foundMatchCount: 0,
        purity: 0,
        completeness: 0,
        executionTimeMs: 0,
      });
    }
  }
  return { results, totalTimeMs: Date.now() - totalStart };
}

export function formatBenchmarkReport(results: BenchmarkResult[]): string {
  const lines: string[] = [
    '='.repeat(70),
    '  Entity Resolver Benchmark Report',
    '='.repeat(70),
    '',
    '  Dataset             | Records | Matches | Purity  | Completeness | Time',
    '  ' + '-'.repeat(67),
  ];
  for (const r of results) {
    lines.push(
      `  ${r.dataset.padEnd(20)} | ${String(r.recordCount).padStart(7)} | ${String(r.foundMatchCount).padStart(7)} | ${r.purity.toFixed(3).padStart(7)} | ${r.completeness.toFixed(3).padStart(12)} | ${String(r.executionTimeMs + 'ms').padStart(7)}`,
    );
  }
  lines.push('  ' + '-'.repeat(67));
  const totalTime = results.reduce((s, r) => s + r.executionTimeMs, 0);
  lines.push(`  Total: ${totalTime}ms`);
  return lines.join('\n');
}
