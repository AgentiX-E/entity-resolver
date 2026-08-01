/**
 * Tests for DuckDBStore edge cases — queryNeighbors variants, init failure, fallback behavior.
 *
 * Uses a mock DuckDB connection to test all code paths without real DuckDB.
 */
import { describe, it, expect } from 'vitest';
import { DuckDBStore } from '../duckdb-store.js';
import type { EntityRecord } from '@agentix-e/entity-resolver-core';

// ── Mock DuckDB Connection Factory ──

interface MockDbRow {
  cluster_id: string;
  members_json: string;
  cohesion: number;
}

type RunCallback = (err: Error | null) => void;
type AllCallback = (err: Error | null, rows: MockDbRow[]) => void;
type CloseCallback = () => void;

interface MockDuckDb {
  run: (sql: string, cb: RunCallback) => void;
  all: (sql: string, ...args: unknown[]) => void;
  close: (cb: CloseCallback) => void;
}

function createMockDb(
  opts: {
    initFails?: boolean;
    rows?: MockDbRow[];
    runError?: Error | null;
  } = {},
): MockDuckDb {
  const rows = opts.rows ?? [];

  return {
    run(_sql: string, ...args: unknown[]): void {
      const cb = args[args.length - 1] as RunCallback;
      if (opts.runError) {
        cb(opts.runError);
        return;
      }
      if (opts.initFails && _sql.includes('CREATE TABLE')) {
        cb(new Error('init failed'));
        return;
      }
      cb(null);
    },
    all(_sql: string, ...args: unknown[]): void {
      const cb = args[args.length - 1] as AllCallback;
      cb(null, rows);
    },
    close(cb: CloseCallback): void {
      cb();
    },
  };
}

// ── Test Records ──

const recordA: EntityRecord = {
  clusterId: 'A',
  memberIds: [1, 2, 3],
  cohesion: 0.9,
};

const recordB: EntityRecord = {
  clusterId: 'B',
  memberIds: [3, 4, 5],
  cohesion: 0.8,
};

const recordC: EntityRecord = {
  clusterId: 'C',
  memberIds: [5, 6, 7],
  cohesion: 0.7,
};

function entityToRow(e: EntityRecord): MockDbRow {
  return {
    cluster_id: e.clusterId,
    members_json: JSON.stringify(e.memberIds),
    cohesion: e.cohesion,
  };
}

describe('DuckDBStore — queryNeighbors', () => {
  let store: DuckDBStore;

  it('queryNeighbors single-hop — returns self and neighbors', async () => {
    const rows = [
      entityToRow(recordA),
      entityToRow(recordB),
      entityToRow(recordC),
    ];
    const mockDb = createMockDb({ rows });

    store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.queryNeighbors('A', 1);

    // Should include self (A) and B (shares member 3)
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.clusterId).toBe('A');
  });

  it('queryNeighbors single-hop — returns 1 result from small set', async () => {
    const mockDb = createMockDb({ rows: [entityToRow(recordA)] });

    store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.queryNeighbors('A', 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.clusterId).toBe('A');
  });

  it('queryNeighbors multi-hop BFS — traverses 2 levels', async () => {
    const rows = [
      entityToRow(recordA),
      entityToRow(recordB),
      entityToRow(recordC),
    ];
    const mockDb = createMockDb({ rows });

    store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.queryNeighbors('A', 2);

    // Should include A, B (level 1), C (level 2)
    const clusterIds = result.map((r) => r.clusterId);
    expect(clusterIds).toContain('A');
    expect(clusterIds).toContain('B');
    expect(clusterIds).toContain('C');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('queryNeighbors with cycle — does not loop (mutual references)', async () => {
    // A shares member 2 with B, B shares member 1 with A (mutual overlap)
    const aRow = entityToRow({ clusterId: 'A', memberIds: [1, 2], cohesion: 0.9 });
    const bRow = entityToRow({ clusterId: 'B', memberIds: [2, 1], cohesion: 0.8 });

    const mockDb = createMockDb({ rows: [aRow, bRow] });

    store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.queryNeighbors('A', 5);

    // Should not loop infinitely — visited set prevents revisiting
    expect(result.length).toBe(2); // A and B
  });

  it('queryNeighbors with max depth 0 — returns only self', async () => {
    const rows = [entityToRow(recordA), entityToRow(recordB)];
    const mockDb = createMockDb({ rows });

    store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.queryNeighbors('A', 0);

    expect(result).toHaveLength(1);
    expect(result[0]!.clusterId).toBe('A');
  });

  it('queryNeighbors with no matching entity — returns empty array', async () => {
    const mockDb = createMockDb({ rows: [entityToRow(recordA)] });

    store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.queryNeighbors('NONEXISTENT', 2);

    expect(result).toEqual([]);
  });

  it('queryNeighbors with empty database — returns empty array', async () => {
    const mockDb = createMockDb({ rows: [] });

    store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.queryNeighbors('ANY', 1);
    expect(result).toEqual([]);
  });
});

describe('DuckDBStore — init failure', () => {
  it('init failure — ready stays false', async () => {
    const mockDb = createMockDb({ initFails: true });
    const store = new DuckDBStore(mockDb);

    await (store as unknown as { init(): Promise<void> }).init();

    // After init failure, ready should be false
    const inner = store as unknown as { ready: boolean };
    expect(inner.ready).toBe(false);
  });

  it('init failure — upsertEntity falls back to memory store', async () => {
    const mockDb = createMockDb({ initFails: true });
    const store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    // Should fall back to memory store (no error thrown)
    await expect(
      store.upsertEntity({ clusterId: 'test', memberIds: [1], cohesion: 1 }),
    ).resolves.toBeUndefined();

    // Entity should be in memory store
    const entity = await store.getEntity('test');
    expect(entity).not.toBeNull();
    expect(entity!.clusterId).toBe('test');
  });
});

describe('DuckDBStore — fallback behavior', () => {
  let store: DuckDBStore;

  describe('upsertEntity', () => {
    it('upsertEntity with ready=false — falls back to memory store', async () => {
      // Create store without init — ready defaults to false
      const mockDb = createMockDb();
      store = new DuckDBStore(mockDb);
      // Do NOT call init — ready stays false

      await store.upsertEntity({ clusterId: 'fallback-1', memberIds: [100], cohesion: 0.5 });

      const entity = await store.getEntity('fallback-1');
      expect(entity).not.toBeNull();
      expect(entity!.clusterId).toBe('fallback-1');
      expect(entity!.memberIds).toEqual([100]);
      expect(entity!.cohesion).toBe(0.5);
    });

    it('upsertEntity with ready=true — uses DuckDB', async () => {
      const mockDb = createMockDb();
      store = new DuckDBStore(mockDb);
      await (store as unknown as { init(): Promise<void> }).init();

      // This should call duckdb.run() without error
      await expect(
        store.upsertEntity({ clusterId: 'db-1', memberIds: [1], cohesion: 0.9 }),
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteEntity fallback', () => {
    it('deleteEntity with ready=false — falls back to memory store', async () => {
      const mockDb = createMockDb();
      store = new DuckDBStore(mockDb);
      // ready=false (no init)

      // First upsert via fallback
      await store.upsertEntity({ clusterId: 'to-delete', memberIds: [42], cohesion: 0 });

      // Delete via fallback
      await store.deleteEntity('to-delete');

      // Should be gone
      const entity = await store.getEntity('to-delete');
      expect(entity).toBeNull();
    });
  });

  describe('applyMerge', () => {
    it('applyMerge with ready=false — falls back to memory store', async () => {
      const mockDb = createMockDb();
      store = new DuckDBStore(mockDb);
      // ready=false

      await store.upsertEntity({ clusterId: 'from', memberIds: [1, 2], cohesion: 0.8 });
      await store.upsertEntity({ clusterId: 'into', memberIds: [3, 4], cohesion: 0.7 });

      await store.applyMerge('from', 'into');

      // from should be deleted
      expect(await store.getEntity('from')).toBeNull();
      // into should have merged members
      const merged = await store.getEntity('into');
      expect(merged).not.toBeNull();
      // Members should be union: [3,4,1,2] — compare sorted copies
      const sortedMembers = [...(merged!.memberIds)].sort((a, b) => a - b);
      expect(sortedMembers).toEqual([1, 2, 3, 4]);
    });

    it('applyMerge with ready=true — uses DuckDB', async () => {
      const mockDb = createMockDb({
        rows: [
          { cluster_id: 'from', members_json: '[1,2]', cohesion: 0.8 },
          { cluster_id: 'into', members_json: '[3,4]', cohesion: 0.7 },
        ],
      });
      store = new DuckDBStore(mockDb);
      await (store as unknown as { init(): Promise<void> }).init();

      // Should not throw
      await expect(store.applyMerge('from', 'into')).resolves.toBeUndefined();
    });

    it('applyMerge with non-existent from entity — no-op', async () => {
      const mockDb = createMockDb({
        rows: [{ cluster_id: 'into', members_json: '[3,4]', cohesion: 0.7 }],
      });
      store = new DuckDBStore(mockDb);
      await (store as unknown as { init(): Promise<void> }).init();

      await store.applyMerge('nonexistent', 'into');

      // Should not throw, nothing changed
      const entity = await store.getEntity('into');
      expect(entity).not.toBeNull();
    });
  });

  describe('applySplit', () => {
    it('applySplit with ready=false — falls back to memory store', async () => {
      const mockDb = createMockDb();
      store = new DuckDBStore(mockDb);
      // ready=false

      await store.upsertEntity({ clusterId: 'split-me', memberIds: [1, 2, 3, 4], cohesion: 0.9 });

      await store.applySplit('split-me', [['1', '2'], ['3', '4']]);

      // Original should be deleted
      expect(await store.getEntity('split-me')).toBeNull();
      // New split entities should exist
      const split1 = await store.getEntity('split-me_split_0');
      expect(split1).not.toBeNull();
      expect(split1!.memberIds).toEqual([1, 2]);
      const split2 = await store.getEntity('split-me_split_1');
      expect(split2).not.toBeNull();
      expect(split2!.memberIds).toEqual([3, 4]);
    });

    it('applySplit with ready=true — uses DuckDB', async () => {
      const mockDb = createMockDb({
        rows: [{ cluster_id: 'split-me', members_json: '[1,2,3,4]', cohesion: 0.9 }],
      });
      store = new DuckDBStore(mockDb);
      await (store as unknown as { init(): Promise<void> }).init();

      await expect(store.applySplit('split-me', [['1', '2'], ['3', '4']])).resolves.toBeUndefined();
    });
  });
});

describe('DuckDBStore — getEntity', () => {
  it('getEntity with ready=false — uses fallback', async () => {
    const mockDb = createMockDb();
    const store = new DuckDBStore(mockDb);
    // ready=false

    await store.upsertEntity({ clusterId: 'fb-get', memberIds: [99], cohesion: 0.3 });

    const entity = await store.getEntity('fb-get');
    expect(entity).not.toBeNull();
    expect(entity!.clusterId).toBe('fb-get');
  });

  it('getEntity returns null for missing entity (ready=true)', async () => {
    const mockDb = createMockDb({ rows: [] });
    const store = new DuckDBStore(mockDb);
    await (store as unknown as { init(): Promise<void> }).init();

    const result = await store.getEntity('nonexistent');
    expect(result).toBeNull();
  });
});

describe('DuckDBStore — close', () => {
  it('close terminates the connection', async () => {
    const mockDb = createMockDb();
    const store = new DuckDBStore(mockDb);

    await expect(store.close()).resolves.toBeUndefined();
  });
});
