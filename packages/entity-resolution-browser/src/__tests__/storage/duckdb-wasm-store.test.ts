import { describe, it, expect } from 'vitest';
import { DuckDBWasmStore } from '../../index.js';

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
  });

  it('custom wasmUrl is accepted', async () => {
    const store = new DuckDBWasmStore({ wasmUrl: 'https://assets.corp.com/duckdb.wasm', offline: true });
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
    const r = store.getInitResult();
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
});
