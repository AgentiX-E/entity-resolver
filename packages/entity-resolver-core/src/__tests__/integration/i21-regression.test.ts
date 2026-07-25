// Tests for queryNeighbors multi-hop traversal + golden record numeric strategies.
import { describe, it, expect } from 'vitest';
import { MemoryEntityStore } from '../../memory/entity-store.js';
import { buildGoldenRecord } from '../../golden-record.js';

describe('MemoryEntityStore.queryNeighbors', () => {
  it('returns entities sharing members', async () => {
    const store = new MemoryEntityStore();
    await store.upsertEntity({ clusterId: 'e1', memberIds: [0, 1], cohesion: 0.9 });
    await store.upsertEntity({ clusterId: 'e2', memberIds: [1, 2], cohesion: 0.8 });
    await store.upsertEntity({ clusterId: 'e3', memberIds: [3, 4], cohesion: 0.7 });

    const neighbors = await store.queryNeighbors('e1');
    expect(neighbors.length).toBe(1); // e2 shares member 1
    expect(neighbors[0]!.clusterId).toBe('e2');
  });

  it('multi-hop traverses graph', async () => {
    const store = new MemoryEntityStore();
    await store.upsertEntity({ clusterId: 'e1', memberIds: [0, 1], cohesion: 0.9 });
    await store.upsertEntity({ clusterId: 'e2', memberIds: [1, 2], cohesion: 0.8 });
    await store.upsertEntity({ clusterId: 'e3', memberIds: [2, 3], cohesion: 0.7 });

    const neighbors = await store.queryNeighbors('e1', 2);
    expect(neighbors.length).toBe(2); // e2 (1 hop) + e3 (2 hops via e2)
  });

  it('returns empty for non-existent entity', async () => {
    const store = new MemoryEntityStore();
    expect(await store.queryNeighbors('nonexistent')).toEqual([]);
  });
});

describe('Golden Record numeric strategies', () => {
  it('avg computes numeric average', () => {
    const records = [{ score: '10' }, { score: '20' }, { score: '30' }];
    const result = buildGoldenRecord(records, { defaultStrategy: 'avg' });
    expect(result.goldenRecord.score).toBe(20);
  });

  it('min selects minimum', () => {
    const records = [{ price: '100' }, { price: '50' }, { price: '75' }];
    const result = buildGoldenRecord(records, { defaultStrategy: 'min' });
    expect(result.goldenRecord.price).toBe(50);
  });

  it('max selects maximum', () => {
    const records = [{ price: '100' }, { price: '50' }, { price: '75' }];
    const result = buildGoldenRecord(records, { defaultStrategy: 'max' });
    expect(result.goldenRecord.price).toBe(100);
  });

  it('median picks middle value', () => {
    const records = [{ x: '10' }, { x: '30' }, { x: '20' }];
    const result = buildGoldenRecord(records, { defaultStrategy: 'median' });
    expect(result.goldenRecord.x).toBe(20);
  });

  it('most_recent picks latest date', () => {
    const records = [{ date: '2024-01-15' }, { date: '2024-06-20' }, { date: '2023-12-01' }];
    const result = buildGoldenRecord(records, { defaultStrategy: 'most_recent' });
    expect(result.goldenRecord.date).toBe('2024-06-20');
  });

  it('oldest picks earliest date', () => {
    const records = [{ date: '2024-01-15' }, { date: '2024-06-20' }, { date: '2023-12-01' }];
    const result = buildGoldenRecord(records, { defaultStrategy: 'oldest' });
    expect(result.goldenRecord.date).toBe('2023-12-01');
  });

  it('avg falls back to first value on non-numeric', () => {
    const records = [{ name: 'Alice' }, { name: 'Bob' }];
    const result = buildGoldenRecord(records, { defaultStrategy: 'avg' });
    expect(result.goldenRecord.name).toBe('Alice');
  });
});
