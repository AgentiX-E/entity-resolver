/**
 * Tests for IDataSource interface, streaming pipeline, and mutateInput option.
 */
import { describe, it, expect } from 'vitest';
import type { IDataSource } from '../../interfaces/IDataSource.js';
import { runPipelineFromSource, runPipeline } from '../../pipeline/runner.js';
import { nameComparisonSpec } from '../../matching/comparison.js';

/** In-memory IDataSource implementation for testing. */
class MemoryDataSource implements IDataSource {
  constructor(private records: Record<string, unknown>[]) {}

  async *read(): AsyncIterable<Record<string, unknown>> {
    for (const record of this.records) {
      yield record;
    }
  }

  async estimatedCount(): Promise<number> {
    return this.records.length;
  }
}

const MINIMAL_CONFIG = {
  blocking: {
    passes: [
      { fields: ['city'], transforms: ['lowercase'] as const },
      { fields: ['name'], transforms: ['lowercase'] as const },
    ],
  },
  comparisons: [nameComparisonSpec('name'), nameComparisonSpec('city')],
  matchThreshold: 0.5,
};

describe('MemoryDataSource', () => {
  it('streams records via async iteration', async () => {
    const ds = new MemoryDataSource([{ a: 1 }, { b: 2 }, { c: 3 }]);
    const collected: Record<string, unknown>[] = [];
    for await (const record of ds.read()) {
      collected.push(record);
    }
    expect(collected).toHaveLength(3);
    expect(collected[0]).toEqual({ a: 1 });
  });

  it('reports correct estimated count', async () => {
    const ds = new MemoryDataSource(Array(100).fill({}));
    expect(await ds.estimatedCount()).toBe(100);
  });

  it('handles empty data source', async () => {
    const ds = new MemoryDataSource([]);
    const collected: Record<string, unknown>[] = [];
    for await (const r of ds.read()) collected.push(r);
    expect(collected).toHaveLength(0);
  });
});

describe('runPipelineFromSource', () => {
  it('runs pipeline from streaming source', async () => {
    const records = [
      { name: 'John Smith', city: 'NYC' },
      { name: 'Jon Smyth', city: 'NYC' },
      { name: 'Jane Doe', city: 'LA' },
    ];
    const ds = new MemoryDataSource(records);

    const result = await runPipelineFromSource(ds, MINIMAL_CONFIG);
    expect(result.statistics.totalRecords).toBe(3);
    expect(result.scoredPairs.length).toBeGreaterThan(0);
  });
});

describe('runPipeline mutateInput option', () => {
  it('mutates input by default (in-place preprocessing)', async () => {
    const records = [
      { name: '  John  ', city: 'NYC' },
      { name: '  John  ', city: 'NYC' },
      { name: '  John  ', city: 'NYC' },
    ];
    const original = structuredClone(records);

    await runPipeline(records, {
      blocking: { passes: [{ fields: ['city', 'name'], transforms: ['lowercase'] as const }] },
      comparisons: [nameComparisonSpec('name')],
      matchThreshold: 0.5,
    });

    // With default mutateInput=true, whitespace should be trimmed in-place
    expect(records[0]!.name).not.toBe(original[0]!.name);
  });

  it('preserves input when mutateInput=false', async () => {
    const records = [
      { name: '  John  ', city: 'NYC' },
      { name: '  John  ', city: 'NYC' },
      { name: '  John  ', city: 'NYC' },
    ];
    const originalName = records[0]!.name;

    await runPipeline(records, {
      blocking: { passes: [{ fields: ['city', 'name'], transforms: ['lowercase'] as const }] },
      comparisons: [nameComparisonSpec('name')],
      matchThreshold: 0.5,
    }, { mutateInput: false });

    // With mutateInput=false, original should be unchanged
    expect(records[0]!.name).toBe(originalName);
  });

  it('produces identical clustering with either mutateInput option', async () => {
    const records1 = [
      { name: 'John', city: 'NYC' },
      { name: 'Jon', city: 'New York' },
      { name: 'John', city: 'NYC' },
    ];
    const records2 = structuredClone(records1);

    const r1 = await runPipeline(records1, MINIMAL_CONFIG, { mutateInput: true });
    const r2 = await runPipeline(records2, MINIMAL_CONFIG, { mutateInput: false });

    expect(r1.statistics.totalClusters).toBe(r2.statistics.totalClusters);
  });
});
