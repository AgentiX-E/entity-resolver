// Tests for DuckDB WASM import failure and fallback behavior.
// Uses vi.mock at file top (properly hoisted) to intercept dynamic imports.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@duckdb/duckdb-wasm', () => {
  // Simulate WASM binary download failure
  return {
    default: {},
    getJsDelivrBundles: vi.fn().mockRejectedValue(new Error('CDN unavailable')),
    selectBundle: vi.fn(),
    DuckDBBundle: {},
    DuckDBDataProtocol: {},
  };
});

import { DuckDBWasmStore } from '../../storage/duckdb-wasm-store.js';

describe('DuckDBWasmStore — WASM import failure', () => {
  let store: DuckDBWasmStore;

  beforeEach(() => {
    store = new DuckDBWasmStore({ offline: false, downloadTimeout: 100 });
  });

  it('init() falls back to memory when WASM import fails', async () => {
    // WASM binary download should be intercepted by vi.mock and fail
    const result = await store.init();
    expect(result.wasmActive).toBe(false);
    expect(result.tier).toBe('memory_fallback');
    expect(result.status).toBeTruthy();
  });

  it('getInitResult before init() returns default state', () => {
    const result = store.getInitResult();
    // Before init(), getInitResult returns default values
    expect(result).toBeDefined();
    expect(result.tier).toBeDefined();
  });

  it('CRUD works via memory fallback after WASM failure', async () => {
    await store.init();
    await store.upsertEntity({ clusterId: 'wasm-fail-test', memberIds: [1], cohesion: 1 });
    const entity = await store.getEntity('wasm-fail-test');
    expect(entity).not.toBeNull();
    expect(entity!.clusterId).toBe('wasm-fail-test');
  });

  it('close() does not throw on memory fallback', async () => {
    await store.init();
    await store.close();
  });

  it('queryNeighbors returns empty for nonexistent after WASM failure', async () => {
    await store.init();
    const result = await store.queryNeighbors('nonexistent');
    expect(result).toEqual([]);
  });
});
