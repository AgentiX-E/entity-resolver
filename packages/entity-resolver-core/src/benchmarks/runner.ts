// Automated benchmark runner for ER pipeline evaluation.

import { runPipeline } from '../pipeline/runner.js';
import { loadAllBenchmarks } from './datasets.js';
import type { BenchmarkDataset, BenchmarkResult } from './datasets.js';
import { evaluateClustering } from '../evaluation/metrics.js';
import type { ILogger } from '../interfaces/ILogger.js';
import { nameComparisonSpec } from '../matching/comparison.js';
import type { Cluster } from '../types/core.js';
import type { EntityId } from '../types/core.js';

export async function runBenchmark(
  dataset: BenchmarkDataset,
  logger?: ILogger,
): Promise<BenchmarkResult> {
  const startTime = Date.now();

  const sample = dataset.records[0] ?? {};
  const fields = Object.keys(sample);
  const comps = fields.map((f) => nameComparisonSpec(f));
  const passes =
    fields.length >= 2
      ? [{ fields: fields.slice(0, 2), transforms: ['strip', 'lowercase'] as const }]
      : [{ fields, transforms: ['strip', 'lowercase'] as const }];

  let predClusters = new Map<EntityId, Cluster>();
  let matchCount = 0;

  try {
    const result = await runPipeline(dataset.records, {
      blocking: { passes },
      comparisons: comps,
      matchThreshold: 0.5,
      autoConfigure: false,
    });
    predClusters = result.clusters as Map<EntityId, Cluster>;
    matchCount = result.statistics.matchedRecords;
  } catch (err: unknown) {
    // Pipeline failure is not fatal — return zero-score result.
    // Individual dataset failures are expected (e.g., small datasets may not
    // produce valid blocking results). The benchmark suite continues.
    const msg = err instanceof Error ? err.message : String(err);
    logger?.warn(`Benchmark pipeline failed for ${dataset.name}: ${msg}`, {
      operation: 'runBenchmark',
      cause: msg,
    });
  }

  // Build reference clusters from ground truth
  const refClusters = new Map<EntityId, Cluster>();
  for (const [cid, members] of dataset.groundTruth) {
    refClusters.set(cid, { clusterId: cid, memberIds: members, cohesion: 0 });
  }

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
