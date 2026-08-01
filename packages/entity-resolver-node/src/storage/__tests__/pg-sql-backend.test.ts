/**
 * Tests for PgSqlBackend using manual pool mock.
 * Covers all CRUD operations, batch insert, streaming, error handling, and lifecycle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockQuery, mockRelease, MockPool, mockPoolEnd } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockRelease = vi.fn();
  const mockPoolEnd = vi.fn();
  const MockPool = vi.fn(() => ({
    connect: vi.fn(() => ({ query: mockQuery, release: mockRelease })),
    end: mockPoolEnd,
  }));
  return { mockQuery, mockRelease, MockPool, mockPoolEnd };
});

vi.mock('pg', () => ({
  Pool: MockPool,
}));

import { PgSqlBackend } from '../pg-sql-backend.js';

describe('PgSqlBackend', () => {
  let backend: PgSqlBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    backend = new PgSqlBackend({ pool: { host: 'localhost', database: 'testdb' } });
  });

  afterEach(async () => {
    try { await backend.close(); } catch { /* already closed */ }
  });

  // ─── Construction ────────────────────────────────────────────

  it('should construct with pool config', () => {
    expect(backend).toBeDefined();
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', database: 'testdb' }),
    );
  });

  it('should apply default pool max and idleTimeout', () => {
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 10, idleTimeoutMillis: 30000 }),
    );
  });

  // ─── query ───────────────────────────────────────────────────

  it('should query and return typed rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Alice' }],
      rowCount: 1,
    });
    const rows = await backend.query('SELECT * FROM users');
    expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
    expect(mockRelease).toHaveBeenCalled();
  });

  it('should handle query with params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await backend.query('SELECT * FROM users WHERE id = $1', [1]);
    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
  });

  it('should throw on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    await expect(backend.query('SELECT * FROM users')).rejects.toThrow('PostgreSQL query failed');
  });

  it('should release client even on query failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'));
    await expect(backend.query('SELECT * FROM users')).rejects.toThrow();
    expect(mockRelease).toHaveBeenCalled();
  });

  // ─── createTempTable ─────────────────────────────────────────

  it('should create temp table with records', async () => {
    const records = [
      { name: 'Alice', city: 'NYC' },
      { name: 'Bob', city: 'LA' },
    ];
    await backend.createTempTable(records, { name: 'test_tbl' });
    expect(mockQuery).toHaveBeenCalled();
    // Verify CREATE TABLE was called
    const createCalls = mockQuery.mock.calls.filter(
      (c: string[]) => c[0]?.startsWith('CREATE TEMP TABLE'),
    );
    expect(createCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle empty records gracefully', async () => {
    await backend.createTempTable([], { name: 'empty_tbl' });
    // Should not attempt INSERT for empty records
    const insertCalls = mockQuery.mock.calls.filter(
      (c: string[]) => c[0]?.startsWith('INSERT INTO'),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it('should batch insert large datasets', async () => {
    const records = Array.from({ length: 2500 }, (_, i) => ({ idx: i }));
    await backend.createTempTable(records, { name: 'batch_tbl' });
    const insertCalls = mockQuery.mock.calls.filter(
      (c: string[]) => c[0]?.startsWith('INSERT INTO'),
    );
    // 2500 records with BATCH=1000 → 3 batches
    expect(insertCalls.length).toBe(3);
  });

  it('should throw on table creation failure', async () => {
    mockQuery.mockRejectedValueOnce(new Error('permission denied'));
    await expect(
      backend.createTempTable([{ x: 1 }], { name: 'fail_tbl' }),
    ).rejects.toThrow('PostgreSQL createTempTable failed');
  });

  it('should handle null values in records', async () => {
    const records = [{ name: null, city: 'NYC' }];
    await backend.createTempTable(records, { name: 'null_tbl' });
    expect(mockQuery).toHaveBeenCalled();
  });

  // ─── rowCount ────────────────────────────────────────────────

  it('should return row count', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ cnt: '42' }],
      rowCount: 1,
    });
    const count = await backend.rowCount('users');
    expect(count).toBe(42);
  });

  it('should return 0 for empty result', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const count = await backend.rowCount('users');
    expect(count).toBe(0);
  });

  it('should return 0 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('table not found'));
    const count = await backend.rowCount('nonexistent');
    expect(count).toBe(0);
  });

  // ─── dropTempTable ───────────────────────────────────────────

  it('should drop temp table', async () => {
    await backend.dropTempTable('old_tbl');
    expect(mockQuery).toHaveBeenCalledWith('DROP TABLE IF EXISTS old_tbl');
  });

  it('should handle drop failure gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('table dropped already'));
    await expect(backend.dropTempTable('gone')).resolves.toBeUndefined();
  });

  // ─── exec ────────────────────────────────────────────────────

  it('should execute SQL via exec', async () => {
    await backend.exec('CREATE INDEX idx_name ON users(name)');
    expect(mockQuery).toHaveBeenCalledWith('CREATE INDEX idx_name ON users(name)');
  });

  // ─── close ───────────────────────────────────────────────────

  it('should close the connection pool', async () => {
    await backend.close();
    expect(mockPoolEnd).toHaveBeenCalled();
  });

  // ─── streamToTable ───────────────────────────────────────────

  it('should stream records to table', async () => {
    async function* source() {
      yield { name: 'Alice' };
      yield { name: 'Bob' };
    }
    await backend.streamToTable(source(), { name: 'stream_tbl' });
    expect(mockQuery).toHaveBeenCalled();
  });

  // ─── Edge cases ──────────────────────────────────────────────

  it('should handle records with special characters in column names', async () => {
    const records = [{ 'user-name': 'alice', 'last name': 'smith' }];
    await backend.createTempTable(records, { name: 'special_chars' });
    expect(mockQuery).toHaveBeenCalled();
  });

  it('should handle explicit columns config', async () => {
    const records = [{ a: 1, b: 2, c: 3 }];
    await backend.createTempTable(records, {
      name: 'cols_test',
      columns: ['a', 'b'],
    });
    expect(mockQuery).toHaveBeenCalled();
  });
});
