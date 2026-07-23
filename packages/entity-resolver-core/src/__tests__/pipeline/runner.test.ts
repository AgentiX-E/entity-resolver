// Tests for the entity resolution pipeline and benchmarks.

import { describe, it, expect } from 'vitest';
import {
  runPipeline,
  loadFebrl,
  loadDblpAcm,
  loadAllBenchmarks,
  runBenchmark,
  formatBenchmarkReport,
} from '../../index.js';
import type { PipelineConfig } from '../../index.js';

const defaultConfig: PipelineConfig = {
  blocking: { passes: [{ fields: ['given_name', 'surname'], transforms: ['strip', 'lowercase'] }] },
  comparisons: [
    {
      field: 'given_name',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'weak_match', threshold: 0.5 },
      ],
    },
  ],
  matchThreshold: 0.5,
  tfFields: [],
};

describe('runPipeline', () => {
  it('completes end-to-end on small dataset', async () => {
    const records = [
      { given_name: 'John', surname: 'Smith' },
      { given_name: 'Jon', surname: 'Smyth' },
      { given_name: 'Jane', surname: 'Doe' },
      { given_name: 'John', surname: 'Smith' },
      { given_name: 'Bob', surname: 'Wilson' },
    ];

    const result = await runPipeline(records, defaultConfig);
    expect(result.statistics.totalRecords).toBe(5);
    expect(result.statistics.executionTimeMs).toBeGreaterThan(0);
    expect(result.diagnostics).toBeDefined();
  });

  it('empty records throw (cannot estimate EM params)', async () => {
    await expect(runPipeline([], defaultConfig)).rejects.toThrow();
  });
});

describe('Benchmark datasets', () => {
  it('FEBRL loads correctly', () => {
    const feb = loadFebrl();
    expect(feb.recordCount).toBeGreaterThan(0);
    expect(feb.groundTruth.size).toBeGreaterThan(0);
  });

  it('DBLP-ACM loads correctly', () => {
    const da = loadDblpAcm();
    expect(da.recordCount).toBeGreaterThan(0);
  });

  it('all 8 datasets load', () => {
    const all = loadAllBenchmarks();
    expect(all.length).toBe(8);
    for (const ds of all) {
      expect(ds.records.length).toBeGreaterThan(0);
      expect(ds.groundTruth.size).toBeGreaterThan(0);
    }
  });
});

describe('Benchmark runner', () => {
  it('runs DBLP-ACM benchmark', async () => {
    const ds = loadDblpAcm();
    const result = await runBenchmark(ds);
    expect(result.dataset).toBe('DBLP-ACM');
    expect(result.recordCount).toBeGreaterThan(0);
    expect(result.executionTimeMs).toBeGreaterThan(0);
    expect(result.purity).toBeGreaterThanOrEqual(0);
    expect(result.completeness).toBeGreaterThanOrEqual(0);
  });

  it('runs all benchmarks', async () => {
    const all = loadAllBenchmarks();
    const ds = all[1]!;
    const result = await runBenchmark(ds);
    expect(result.dataset).toBeTruthy();
  });

  it('formats report', () => {
    const report = formatBenchmarkReport([
      {
        dataset: 'Test',
        recordCount: 10,
        trueMatchCount: 5,
        foundMatchCount: 4,
        purity: 0.8,
        completeness: 0.8,
        executionTimeMs: 100,
      },
    ]);
    expect(report).toContain('Benchmark Report');
  });
});
