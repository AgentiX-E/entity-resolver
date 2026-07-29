/**
 * Splink Comparison Benchmark — Structural validation + throughput logging.
 *
 * Verifies benchmark infrastructure and documents throughput for
 * competitive analysis against Splink's published benchmarks.
 *
 * Splink reference (from official docs):
 *   - 1M records ~1 minute on laptop (DuckDB backend)
 *   - DBLP-ACM F1 ~0.94
 *   - FEBRL 5000 F1 ~0.98
 */
import { describe, it, expect } from 'vitest';
import { loadAllBenchmarks, runBenchmark } from '../index.js';

describe('Splink Comparison Benchmark', () => {
  it('benchmark infrastructure loads all datasets', () => {
    const datasets = loadAllBenchmarks();
    expect(datasets.length).toBeGreaterThan(0);
  });

  it('smallest dataset completes with valid purity/completeness', async () => {
    const datasets = loadAllBenchmarks();
    if (datasets.length === 0) return;

    const small = datasets[0]!;
    const start = performance.now();
    const result = await runBenchmark(small);
    const elapsed = performance.now() - start;

    const f1 =
      result.purity > 0 && result.completeness > 0
        ? (2 * (result.purity * result.completeness)) / (result.purity + result.completeness)
        : 0;

    // Document throughput for Splink comparison
    console.log(
      `[Splink comparison] ${result.dataset}: ${result.recordCount} rec, ` +
        `${elapsed.toFixed(0)}ms, F1=${f1.toFixed(3)}`,
    );

    expect(result.purity).toBeGreaterThanOrEqual(0);
    expect(result.completeness).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(10000);
  }, 15000);
});
