import { describe, it, expect } from 'vitest';
import { DuckDBWasmStore, DuckDBWasmInitResult } from '../../index.js';

// ═══════════════════════════════════════════════════════════════
// DuckDBWasmStore — Enterprise Distribution
// ═══════════════════════════════════════════════════════════════

describe('DuckDBWasmStore — enterprise distribution', () => {
  it('offline mode skips WASM download', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    const result = await store.init();
    expect(result.wasmActive).toBe(false);
    expect(result.tier).toBe('memory_fallback');
    expect(result.status).toContain('Offline');
  });

  it('offline mode CRUD works via memory fallback', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.upsertEntity({ clusterId: 'offline-test', memberIds: [1, 2], cohesion: 0.9 });
    const e = await store.getEntity('offline-test');
    expect(e).not.toBeNull();
    expect(e!.clusterId).toBe('offline-test');
    expect(e!.memberIds).toEqual([1, 2]);
    expect(e!.cohesion).toBe(0.9);
  });

  it('custom wasmUrl is accepted in config', async () => {
    const store = new DuckDBWasmStore({
      wasmUrl: 'https://assets.corp.com/duckdb.wasm',
      offline: true,
    });
    const result = await store.init();
    expect(result.tier).toBe('memory_fallback');
  });

  it('downloadTimeout is accepted', async () => {
    const store = new DuckDBWasmStore({ downloadTimeout: 5000, offline: true });
    await store.init();
    expect(store.getInitResult().wasmActive).toBe(false);
  });

  it('debug mode does not throw', async () => {
    const store = new DuckDBWasmStore({ debug: true, offline: true });
    await store.init();
    expect(store.getInitResult().status).toBeTruthy();
  });

  it('getInitResult returns valid structure', () => {
    const store = new DuckDBWasmStore();
    const r: DuckDBWasmInitResult = store.getInitResult();
    expect(r.tier).toBe('memory_fallback');
    expect(typeof r.wasmActive).toBe('boolean');
    expect(r.status).toBeTruthy();
  });

  it('full CRUD via offline fallback', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.upsertEntity({ clusterId: 'a', memberIds: [1], cohesion: 0.5 });
    await store.upsertEntity({ clusterId: 'b', memberIds: [2, 3], cohesion: 0.7 });
    expect(await store.getEntity('a')).not.toBeNull();
    expect(await store.getEntity('missing')).toBeNull();
    await store.applyMerge('a', 'b');
    expect(await store.getEntity('a')).toBeNull();
    const merged = await store.getEntity('b');
    expect(merged!.memberIds.length).toBe(3);
    await store.deleteEntity('b');
    expect(await store.getEntity('b')).toBeNull();
  });

  it('close returns cleanly', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.close();
  });

  it('wasmFallbackUrls are accepted', async () => {
    const store = new DuckDBWasmStore({
      wasmFallbackUrls: ['https://cdn1.example.com/db.wasm', 'https://cdn2.example.com/db.wasm'],
      offline: true,
    });
    const result = await store.init();
    expect(result.tier).toBe('memory_fallback');
  });

  it('initResult has correct type structure', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    const result = await store.init();
    expect(['bundled', 'custom_url', 'fallback_url', 'github_assets', 'memory_fallback']).toContain(
      result.tier,
    );
    expect(typeof result.wasmActive).toBe('boolean');
    expect(typeof result.status).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════
// DuckDBWasmStore — Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('DuckDBWasmStore — edge cases', () => {
  it('default constructor works', () => {
    const store = new DuckDBWasmStore();
    expect(store).toBeDefined();
    expect(store.getInitResult().tier).toBe('memory_fallback');
  });

  it('empty options works', async () => {
    const store = new DuckDBWasmStore({});
    await store.init();
    expect(store.getInitResult().wasmActive).toBe(false);
  });

  it('upsert then query returns correct data', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    const entity = { clusterId: 'test-1', memberIds: [10, 20, 30], cohesion: 0.85 };
    await store.upsertEntity(entity);
    const result = await store.getEntity('test-1');
    expect(result).not.toBeNull();
    expect(result!.clusterId).toBe('test-1');
    expect(result!.memberIds).toEqual([10, 20, 30]);
    expect(result!.cohesion).toBe(0.85);
  });

  it('queryNeighbors returns entities', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.upsertEntity({ clusterId: 'n1', memberIds: [1], cohesion: 0.5 });
    await store.upsertEntity({ clusterId: 'n2', memberIds: [2], cohesion: 0.5 });
    const neighbors = await store.queryNeighbors('n1');
    expect(neighbors.length).toBeGreaterThanOrEqual(1);
  });

  it('delete non-existent entity is no-op', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.deleteEntity('non-existent');
    expect(await store.getEntity('non-existent')).toBeNull();
  });

  it('applyMerge preserves combined members', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.upsertEntity({ clusterId: 'src', memberIds: [1, 2], cohesion: 0.9 });
    await store.upsertEntity({ clusterId: 'dst', memberIds: [3, 4], cohesion: 0.8 });
    await store.applyMerge('src', 'dst');
    expect(await store.getEntity('src')).toBeNull();
    const merged = await store.getEntity('dst');
    expect(merged!.memberIds.length).toBe(4);
  });

  it('applySplit creates new entities', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.upsertEntity({ clusterId: 'split-me', memberIds: [1, 2, 3, 4], cohesion: 0.7 });
    await store.applySplit('split-me', [
      ['1', '2'],
      ['3', '4'],
    ]);
    const original = await store.getEntity('split-me');
    expect(original).toBeNull();
    const g0 = await store.getEntity('split-me_split_0');
    const g1 = await store.getEntity('split-me_split_1');
    expect(g0).not.toBeNull();
    expect(g1).not.toBeNull();
  });

  it('multiple upserts to same id update correctly', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.upsertEntity({ clusterId: 'update-me', memberIds: [1], cohesion: 0.1 });
    await store.upsertEntity({ clusterId: 'update-me', memberIds: [1, 2, 3], cohesion: 0.9 });
    const updated = await store.getEntity('update-me');
    expect(updated!.memberIds).toEqual([1, 2, 3]);
    expect(updated!.cohesion).toBe(0.9);
  });

  it('cohesion values are preserved through CRUD', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    for (const c of [0.1, 0.5, 0.99]) {
      await store.upsertEntity({ clusterId: `c${c}`, memberIds: [1], cohesion: c });
    }
    expect((await store.getEntity('c0.1'))!.cohesion).toBe(0.1);
    expect((await store.getEntity('c0.5'))!.cohesion).toBe(0.5);
    expect((await store.getEntity('c0.99'))!.cohesion).toBe(0.99);
  });

  it('applyMerge handles non-existent from entity', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.upsertEntity({ clusterId: 'dst', memberIds: [1], cohesion: 1 });
    await store.applyMerge('nonexistent', 'dst');
    const dst = await store.getEntity('dst');
    expect(dst).not.toBeNull();
  });

  it('queryNeighbors for non-existent entity returns empty', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    const result = await store.queryNeighbors('nonexistent', 1);
    expect(result).toEqual([]);
  });

  it('close when WASM is inactive does not throw', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    await store.init();
    await store.close(); // should not throw
  });
});
