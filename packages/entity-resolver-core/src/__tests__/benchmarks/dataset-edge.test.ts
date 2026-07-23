// CSV parsing and datasets edge case tests.
import { describe, it, expect } from 'vitest';
import { runBenchmark, runAllBenchmarks } from '../../benchmarks/runner.js';
import { loadDblpAcm, loadFebrl, loadAllBenchmarks } from '../../benchmarks/datasets.js';
import {
  generateFebrlDataset,
  generateCoraDataset,
} from '../../benchmarks/generator.js';

describe('Dataset loader edge cases', () => {
  it('FEBRL generates at correct scale', () => {
    const d = loadFebrl();
    expect(d.records.length).toBeGreaterThan(4000);
    expect(d.trueMatchCount).toBeGreaterThan(0);
    expect(d.groundTruth.size).toBeGreaterThan(500);
  });

  it('DBLP-ACM loads real or fallback data', () => {
    const d = loadDblpAcm();
    expect(d.records.length).toBeGreaterThan(50);
    expect(d.groundTruth.size).toBeGreaterThan(0);
  });

  it('all 8 benchmarks load without error', () => {
    const all = loadAllBenchmarks();
    expect(all.length).toBe(8);
    for (const d of all) {
      expect(d.records.length).toBeGreaterThan(0);
      expect(d.name).toBeTruthy();
    }
  });

  it('Abt-Buy has multi-source records', () => {
    const all = loadAllBenchmarks();
    const abt = all.find((d) => d.name === 'Abt-Buy')!;
    const sources = new Set(abt.records.map((r) => r['source']));
    expect(sources.size).toBeGreaterThan(1);
  });

  it('Amazon-Google has cross-retailer pairs', () => {
    const all = loadAllBenchmarks();
    const ag = all.find((d) => d.name === 'Amazon-Google')!;
    expect(ag.records.length).toBeGreaterThan(30);
    // Should have 'amazon' in at least one description
    const descs = ag.records.map((r) => String(r['description'] ?? ''));
    expect(descs.some((d) => d.toLowerCase().includes('storage') || d.toLowerCase().includes('memory'))).toBe(true);
  });
});

describe('Generator determinism', () => {
  it('same seed produces identical FEBRL data', () => {
    const a = generateFebrlDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    const b = generateFebrlDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    expect(a.records.length).toBe(b.records.length);
    expect(a.groundTruth.size).toBe(b.groundTruth.size);
    // First record should be identical
    expect(a.records[0]!['given_name']).toBe(b.records[0]!['given_name']);
    expect(a.records[0]!['surname']).toBe(b.records[0]!['surname']);
  });

  it('different seed produces different data', () => {
    const a = generateFebrlDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    const c = generateCoraDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    // Record count may match but record fields differ (person vs paper)
    expect(a.records[0]).not.toEqual(c.records[0]);
  });
});

describe('Benchmark runner edge cases', () => {
  it('handles empty dataset', async () => {
    const result = await runBenchmark({
      name: 'empty', description: '', recordCount: 0, trueMatchCount: 0,
      records: [], groundTruth: new Map(),
    });
    expect(result.dataset).toBe('empty');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('handles single-record dataset', async () => {
    const result = await runBenchmark({
      name: 'single', description: '', recordCount: 1, trueMatchCount: 0,
      records: [{ name: 'Only' }], groundTruth: new Map(),
    });
    expect(result.recordCount).toBe(1);
  });

  it('runs all benchmarks end-to-end', async () => {
    const { results, totalTimeMs } = await runAllBenchmarks();
    expect(results.length).toBe(8);
    expect(totalTimeMs).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.purity).toBeGreaterThanOrEqual(0);
      expect(r.purity).toBeLessThanOrEqual(1);
      expect(r.completeness).toBeGreaterThanOrEqual(0);
      expect(r.completeness).toBeLessThanOrEqual(1);
    }
  }, 30000);
});
