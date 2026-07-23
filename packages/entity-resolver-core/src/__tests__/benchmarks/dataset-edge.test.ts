// CSV parsing and datasets edge case tests.
import { describe, it, expect } from 'vitest';
import { runBenchmark, runAllBenchmarks } from '../../benchmarks/runner.js';
import { loadDblpAcm, loadFebrl, loadAllBenchmarks } from '../../benchmarks/datasets.js';
import {
  generateFebrlDataset,
  generateCoraDataset,
  generateAbtBuyDataset,
  generateAmazonGoogleDataset,
} from '../../benchmarks/generator.js';

describe('Dataset loader edge cases', () => {
  it('FEBRL generates at correct scale', () => {
    const d = loadFebrl();
    expect(d.records.length).toBeGreaterThan(4000);
    expect(d.trueMatchCount).toBeGreaterThan(0);
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
});

describe('Generator edge cases', () => {
  it('same seed produces identical FEBRL data', () => {
    const a = generateFebrlDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    const b = generateFebrlDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    expect(a.records.length).toBe(b.records.length);
    expect(a.records[0]!['given_name']).toBe(b.records[0]!['given_name']);
  });

  it('different generator produces different records', () => {
    const a = generateFebrlDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    const c = generateCoraDataset({ numEntities: 10, recordsPerEntity: 2, noiseRecords: 3 });
    expect(a.records[0]).not.toEqual(c.records[0]);
  });

  it('AbtBuy with 3 variants produces NEW: prefix', () => {
    const a = generateAbtBuyDataset({ numEntities: 3, recordsPerEntity: 3, noiseRecords: 0 });
    const names = a.records.map((r) => String(r['name'] ?? ''));
    expect(names.some((n) => n.startsWith('NEW:'))).toBe(true);
  });

  it('AmazonGoogle produces exact record count', () => {
    const ag = generateAmazonGoogleDataset({ numEntities: 3, recordsPerEntity: 2, noiseRecords: 0 });
    expect(ag.records.length).toBe(6);
  });

  it('Cora trueMatchCount equals entities', () => {
    const g = generateCoraDataset({ numEntities: 5, recordsPerEntity: 2, noiseRecords: 0 });
    expect(g.trueMatchCount).toBe(5);
  });

  it('FEBRL 5x3 yields valid ground truth', () => {
    const g = generateFebrlDataset({ numEntities: 5, recordsPerEntity: 3, noiseRecords: 3 });
    expect(g.records.length).toBeGreaterThanOrEqual(15);
    expect(g.groundTruth.size).toBe(5);
  });
});

describe('Benchmark runner edge cases', () => {
  it('handles empty dataset', async () => {
    const result = await runBenchmark({
      name: 'empty', description: '', recordCount: 0, trueMatchCount: 0,
      records: [], groundTruth: new Map(),
    });
    expect(result.dataset).toBe('empty');
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
      expect(r.completeness).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});

describe('CSV parsing edges', () => {
  it('handles escaped quotes within quoted field', async () => {
    const { parseCsvLine } = await import('../../benchmarks/datasets.js');
    const result = parseCsvLine('"He said ""hello"" to me",simple');
    expect(result.length).toBe(2);
    expect(result[0]).toContain('"hello"');
  });

  it('handles commas within quotes', async () => {
    const { parseCsvLine } = await import('../../benchmarks/datasets.js');
    const result = parseCsvLine('"New York, NY",100,active');
    expect(result.length).toBe(3);
    expect(result[0]).toBe('New York, NY');
  });

  it('handles empty line', async () => {
    const { parseCsvLine } = await import('../../benchmarks/datasets.js');
    const result = parseCsvLine('');
    expect(result.length).toBe(1);
    expect(result[0]).toBe('');
  });

  it('handles simple comma separated', async () => {
    const { parseCsvLine } = await import('../../benchmarks/datasets.js');
    const result = parseCsvLine('a,b,c');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('handles value containing only quotes', async () => {
    const { parseCsvLine } = await import('../../benchmarks/datasets.js');
    const result = parseCsvLine('"""","normal"');
    expect(result.length).toBe(2);
  });
});
