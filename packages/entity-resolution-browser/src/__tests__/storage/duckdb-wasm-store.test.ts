// Tests for DuckDB WASM store — real fallback path tested.
// DuckDB WASM requires Web Workers (not available in jsdom),
// so the store falls back to MemoryEntityStore. We verify the
// fallback works correctly with full CRUD operations.

import { describe, it, expect } from 'vitest';
import { DuckDBWasmStore } from '../../index.js';

describe('DuckDBWasmStore', () => {
  it('creates store instance', () => {
    const store = new DuckDBWasmStore();
    expect(store).toBeDefined();
  });

  it('init attempts WASM and falls back gracefully', async () => {
    const store = new DuckDBWasmStore();
    await store.init();
    // Should not throw — falls back to memory gracefully
  });

  it('upserts and retrieves entity via fallback', async () => {
    const store = new DuckDBWasmStore();
    await store.init();
    await store.upsertEntity({ clusterId: 'wasm-test', memberIds: [1, 2, 3], cohesion: 0.9 });
    const entity = await store.getEntity('wasm-test');
    expect(entity).not.toBeNull();
    expect(entity!.clusterId).toBe('wasm-test');
    expect(entity!.memberIds).toEqual([1, 2, 3]);
  });

  it('returns null for missing entity', async () => {
    const store = new DuckDBWasmStore();
    await store.init();
    expect(await store.getEntity('nonexistent')).toBeNull();
  });

  it('deletes entity', async () => {
    const store = new DuckDBWasmStore();
    await store.init();
    await store.upsertEntity({ clusterId: 'to-delete', memberIds: [1], cohesion: 0.5 });
    await store.deleteEntity('to-delete');
    expect(await store.getEntity('to-delete')).toBeNull();
  });

  it('merges two entities', async () => {
    const store = new DuckDBWasmStore();
    await store.init();
    await store.upsertEntity({ clusterId: 'f', memberIds: [1, 2], cohesion: 0.7 });
    await store.upsertEntity({ clusterId: 'i', memberIds: [3, 4], cohesion: 0.8 });
    await store.applyMerge('f', 'i');
    expect(await store.getEntity('f')).toBeNull();
    const merged = await store.getEntity('i');
    expect(merged!.memberIds.length).toBe(4);
  });

  it('splits entity', async () => {
    const store = new DuckDBWasmStore();
    await store.init();
    await store.upsertEntity({ clusterId: 'parent', memberIds: [1, 2, 3], cohesion: 0.6 });
    await store.applySplit('parent', [['1'], ['2', '3']]);
    expect(await store.getEntity('parent')).toBeNull();
    expect(await store.getEntity('parent_split_0')).not.toBeNull();
    expect(await store.getEntity('parent_split_1')).not.toBeNull();
  });

  it('close terminates gracefully', async () => {
    const store = new DuckDBWasmStore();
    await store.init();
    await store.close();
    // Should not throw
  });
});
