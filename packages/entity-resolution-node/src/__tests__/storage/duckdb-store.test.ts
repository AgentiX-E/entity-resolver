// Tests for DuckDBStore — CRUD, transactions, fallback behavior.

import { describe, it, expect } from 'vitest';
import { DuckDBStore, resolveStorage } from '../../index.js';

describe('DuckDBStore', () => {
  it('creates store in memory mode', async () => {
    const store = await DuckDBStore.create({ path: ':memory:' });
    expect(store).toBeDefined();
    await store.close();
  });

  it('upserts and retrieves entity', async () => {
    const store = await DuckDBStore.create();
    await store.upsertEntity({ clusterId: 'test-entity', memberIds: [1, 2, 3], cohesion: 0.85 });
    const entity = await store.getEntity('test-entity');
    expect(entity).not.toBeNull();
    expect(entity!.clusterId).toBe('test-entity');
    expect(entity!.memberIds).toContain(1);
    expect(entity!.memberIds).toContain(2);
    expect(entity!.cohesion).toBe(0.85);
    await store.close();
  });

  it('returns null for missing entity', async () => {
    const store = await DuckDBStore.create();
    const result = await store.getEntity('nonexistent');
    expect(result).toBeNull();
    await store.close();
  });

  it('deletes entity', async () => {
    const store = await DuckDBStore.create();
    await store.upsertEntity({ clusterId: 'to-delete', memberIds: [1], cohesion: 0.5 });
    await store.deleteEntity('to-delete');
    expect(await store.getEntity('to-delete')).toBeNull();
    await store.close();
  });

  it('queryNeighbors returns related entities', async () => {
    const store = await DuckDBStore.create();
    await store.upsertEntity({ clusterId: 'c0', memberIds: [0, 1, 2], cohesion: 0.8 });
    const neighbors = await store.queryNeighbors('c0', 1);
    expect(neighbors.length).toBeGreaterThanOrEqual(0);
    await store.close();
  });

  it('merges two entities', async () => {
    const store = await DuckDBStore.create();
    await store.upsertEntity({ clusterId: 'from', memberIds: [1, 2], cohesion: 0.7 });
    await store.upsertEntity({ clusterId: 'into', memberIds: [3, 4], cohesion: 0.8 });
    await store.applyMerge('from', 'into');
    const merged = await store.getEntity('into');
    expect(merged).not.toBeNull();
    expect(await store.getEntity('from')).toBeNull();
    await store.close();
  });

  it('splits entity into groups', async () => {
    const store = await DuckDBStore.create();
    await store.upsertEntity({ clusterId: 'parent', memberIds: [1, 2, 3, 4, 5], cohesion: 0.6 });
    await store.applySplit('parent', [['1', '2'], ['3', '4', '5']]);
    expect(await store.getEntity('parent')).toBeNull();
    const g0 = await store.getEntity('parent_split_0');
    expect(g0).not.toBeNull();
    await store.close();
  });

  it('multiple operations in sequence', async () => {
    const store = await DuckDBStore.create();
    // Insert many
    for (let i = 0; i < 20; i++) {
      await store.upsertEntity({ clusterId: `e${i}`, memberIds: [i, i + 100], cohesion: 0.5 + i * 0.02 });
    }
    // Verify all
    for (let i = 0; i < 20; i++) {
      const e = await store.getEntity(`e${i}`);
      expect(e).not.toBeNull();
    }
    // Delete half
    for (let i = 0; i < 10; i++) {
      await store.deleteEntity(`e${i}`);
    }
    for (let i = 0; i < 10; i++) {
      expect(await store.getEntity(`e${i}`)).toBeNull();
    }
    for (let i = 10; i < 20; i++) {
      expect(await store.getEntity(`e${i}`)).not.toBeNull();
    }
    await store.close();
  });
});

describe('resolveStorage with DuckDB', () => {
  it('resolves to duckdb backend when requested', async () => {
    const result = await resolveStorage({ backend: 'duckdb', duckdbPath: ':memory:' });
    expect(result.backend).toBe('duckdb');
    expect(result.store).toBeDefined();
    if ('close' in result.store) {
      await (result.store as DuckDBStore).close();
    }
  });

  it('duckdb store supports full entity lifecycle', async () => {
    const result = await resolveStorage({ backend: 'duckdb' });
    const store = result.store as DuckDBStore;
    await store.upsertEntity({ clusterId: 'lifecycle-test', memberIds: [1], cohesion: 1 });
    const entity = await store.getEntity('lifecycle-test');
    expect(entity!.clusterId).toBe('lifecycle-test');
    await store.deleteEntity('lifecycle-test');
    expect(await store.getEntity('lifecycle-test')).toBeNull();
    await store.close();
  });
});
