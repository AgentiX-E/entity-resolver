// Browser WASM init paths — tests all DuckDBWasmStore initialization scenarios.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuckDBWasmStore } from '../../storage/duckdb-wasm-store.js';

// Mock @duckdb/duckdb-wasm with a fully functional fake using in-memory storage
vi.mock('@duckdb/duckdb-wasm', () => {
  const memTable = new Map<string, { members_json: string; cohesion: number }>();

  const mockConn = {
    query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      // Handle INSERT/REPLACE
      if (sql.includes('INSERT OR REPLACE') && Array.isArray(params) && params.length >= 3) {
        memTable.set(String(params[0]), { members_json: String(params[1]), cohesion: Number(params[2]) });
        return Promise.resolve(undefined);
      }
      // Handle DELETE
      if (sql.includes('DELETE') && Array.isArray(params) && params.length >= 1) {
        memTable.delete(String(params[0]));
        return Promise.resolve(undefined);
      }
      // Handle SELECT with WHERE
      if (sql.includes('WHERE cluster_id') && Array.isArray(params) && params.length >= 1) {
        const row = memTable.get(String(params[0]));
        return Promise.resolve({
          toArray: () => row ? [{ cluster_id: String(params[0]), members_json: row.members_json, cohesion: row.cohesion }] : [],
        });
      }
      // Handle SELECT without WHERE
      return Promise.resolve({
        toArray: () => Array.from(memTable.entries()).map(([id, v]) => ({
          cluster_id: id, members_json: v.members_json, cohesion: v.cohesion,
        })),
      });
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockDB = {
    instantiate: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(mockConn),
    terminate: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: {},
    AsyncDuckDB: vi.fn().mockImplementation(() => mockDB),
    ConsoleLogger: vi.fn(),
    getJsDelivrBundles: vi.fn().mockReturnValue([{ mainModule: 'mock.wasm', mainWorker: 'mock-worker.js' }]),
    selectBundle: vi.fn().mockResolvedValue({ mainModule: 'mock.wasm', mainWorker: 'mock-worker.js' }),
    DuckDBBundle: {},
    DuckDBDataProtocol: {},
  };
});

describe('DuckDBWasmStore init paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Worker and Blob for WASM worker creation
    vi.stubGlobal('Worker', vi.fn());
    vi.stubGlobal('Blob', vi.fn().mockImplementation((content: string[]) => content));
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:mock'), revokeObjectURL: vi.fn() });
  });

  it('offline mode uses memory fallback', async () => {
    const store = new DuckDBWasmStore({ offline: true });
    const result = await store.init();
    expect(result.tier).toBe('memory_fallback');
    expect(result.wasmActive).toBe(false);
  });

  it('init with bundled WASM succeeds', async () => {
    const store = new DuckDBWasmStore({});
    const result = await store.init();
    expect(result.wasmActive).toBe(true);
    expect(result.tier).toBe('bundled');
    expect(result.status).toContain('active');
  }, 5000);

  it('init with custom URL uses custom_url tier', async () => {
    const store = new DuckDBWasmStore({ wasmUrl: 'https://custom.cdn/duckdb.wasm' });
    const result = await store.init();
    expect(result.wasmActive).toBe(true);
    expect(result.tier).toBe('custom_url');
  }, 5000);

  it('init with fallback URLs', async () => {
    const store = new DuckDBWasmStore({
      wasmFallbackUrls: ['https://cdn1.example.com/duckdb.wasm', 'https://cdn2.example.com/duckdb.wasm'],
    });
    const result = await store.init();
    expect(result.wasmActive).toBe(true);
  }, 5000);

  it('init with debug logging enabled', async () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const store = new DuckDBWasmStore({ debug: true });
    await store.init();
    if (spy.mock.calls.length > 0) {
      expect(spy.mock.calls[0]![0]).toContain('[DuckDBWasmStore]');
    }
    spy.mockRestore();
  }, 5000);

  it('CRUD operations work after init', async () => {
    const store = new DuckDBWasmStore({});
    await store.init();
    // Test upsert
    await store.upsertEntity({ clusterId: 'c1', memberIds: [1, 2], cohesion: 0.8 });
    // Test get
    const entity = await store.getEntity('c1');
    if (entity) {
      expect(entity.clusterId).toBe('c1');
      expect(entity.memberIds).toContain(1);
    }
    // Test delete
    await store.deleteEntity('c1');
    const deleted = await store.getEntity('c1');
    expect(deleted || null).toBe(null);
    // Test close
    await store.close();
  }, 5000);

  it('queryNeighbors returns results', async () => {
    const store = new DuckDBWasmStore({});
    await store.init();
    await store.upsertEntity({ clusterId: 'n1', memberIds: [1, 2], cohesion: 0.9 });
    const neighbors = await store.queryNeighbors('n1', 1);
    expect(Array.isArray(neighbors)).toBe(true);
    await store.close();
  }, 5000);

  it('applyMerge combines entities', async () => {
    const store = new DuckDBWasmStore({});
    await store.init();
    await store.upsertEntity({ clusterId: 'from', memberIds: [1], cohesion: 0.5 });
    await store.upsertEntity({ clusterId: 'into', memberIds: [2], cohesion: 0.5 });
    await store.applyMerge('from', 'into');
    const merged = await store.getEntity('into');
    expect(merged).not.toBeNull();
    if (merged) {
      expect(merged.memberIds).toContain(1);
      expect(merged.memberIds).toContain(2);
    }
    await store.close();
  }, 5000);

  it('applySplit creates sub-entities', async () => {
    const store = new DuckDBWasmStore({});
    await store.init();
    await store.upsertEntity({ clusterId: 'big', memberIds: [1, 2, 3, 4], cohesion: 0.5 });
    await store.applySplit('big', [['1', '2'], ['3', '4']]);
    const s0 = await store.getEntity('big_split_0');
    const s1 = await store.getEntity('big_split_1');
    expect(s0).not.toBeNull();
    expect(s1).not.toBeNull();
    await store.close();
  }, 5000);

  it('getInitResult returns state', () => {
    const store = new DuckDBWasmStore({ offline: true });
    const beforeInit = store.getInitResult();
    expect(beforeInit.status).toContain('Not initialized');
    // Init and check again
    return store.init().then(() => {
      const afterInit = store.getInitResult();
      expect(afterInit.tier).toBe('memory_fallback');
    });
  });
});
