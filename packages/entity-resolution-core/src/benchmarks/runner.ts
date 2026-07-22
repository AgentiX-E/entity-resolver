// Automated benchmark runner for ER pipeline evaluation.

import { runPipeline } from '../pipeline/runner.js';
import { loadAllBenchmarks } from './datasets.js';
import type { BenchmarkDataset, BenchmarkResult } from './datasets.js';
import { evaluateClustering } from '../evaluation/metrics.js';
import { nameComparisonSpec } from '../matching/comparison.js';
import type { Cluster } from '../types/core.js';
import type { EntityId } from '../types/core.js';

/** Run a single benchmark dataset through the pipeline. */
export async function runBenchmark(dataset: BenchmarkDataset): Promise<BenchmarkResult> {
  const startTime = Date.now();

  // Auto-detect fields from dataset
  const sample = dataset.records[0] ?? {};
  const fields = Object.keys(sample);
  const comps = fields.map((f) => nameComparisonSpec(f));
  const passes =
    fields.length >= 2
      ? [{ fields: fields.slice(0, 2), transforms: ['strip', 'lowercase'] as const }]
      : [{ fields, transforms: ['strip', 'lowercase'] as const }];

  const result = await runPipeline(dataset.records, {
    blocking: { passes },
    comparisons: comps,
    matchThreshold: 0.5,
    autoConfigure: false,
  });

  // Build predicted clusters from ground truth format
  const predClusters = new Map<EntityId, Cluster>();
  for (const [cid, cluster] of result.clusters) {
    predClusters.set(cid, cluster);
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
    foundMatchCount: result.statistics.matchedRecords,
    purity: em.clusterPrecision,
    completeness: em.clusterRecall,
    executionTimeMs: Date.now() - startTime,
  };
}

/** Run all 8 benchmarks and return a summary report. */
export async function runAllBenchmarks(): Promise<{
  results: BenchmarkResult[];
  totalTimeMs: number;
}> {
  const datasets = loadAllBenchmarks();
  const results: BenchmarkResult[] = [];
  const totalStart = Date.now();

  for (const dataset of datasets) {
    results.push(await runBenchmark(dataset));
  }

  return {
    results,
    totalTimeMs: Date.now() - totalStart,
  };
}

/** Generate a multi-line report string from benchmark results. */
export function formatBenchmarkReport(results: BenchmarkResult[]): string {
  const lines: string[] = [
    '='.repeat(70),
    '  Entity Resolution Benchmark Report',
    '='.repeat(70),
    '',
    '  Dataset             | Records | Matches | Purity  | Completeness | Time    ',
    '  ' + '-'.repeat(67),
  ];

  for (const r of results) {
    lines.push(
      `  ${r.dataset.padEnd(20)} | ${String(r.recordCount).padStart(7)} | ${String(r.foundMatchCount).padStart(7)} | ${r.purity.toFixed(3).padStart(7)} | ${r.completeness.toFixed(3).padStart(12)} | ${String(r.executionTimeMs + 'ms').padStart(7)}`,
    );
  }

  lines.push('  ' + '-'.repeat(67));
  const totalTime = results.reduce((s, r) => s + r.executionTimeMs, 0);
  lines.push(`  Total execution time: ${totalTime}ms`);
  lines.push('');

  return lines.join('\n');
}
