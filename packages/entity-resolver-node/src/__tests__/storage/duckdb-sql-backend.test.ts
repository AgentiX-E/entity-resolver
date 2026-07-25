// Tests for DuckDbSqlBackend + SQL blocking.
// Validates SQL execution, temp table creation, blocking queries, and edge cases.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DuckDbSqlBackend } from '../../storage/duckdb-sql-backend.js';
import { sqlBlocking } from '@agentix-e/entity-resolver-core';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

let backend: DuckDbSqlBackend;

beforeAll(() => {
  backend = new DuckDbSqlBackend({ path: ':memory:' });
});

afterAll(async () => {
  await backend.close();
});

const testRecords = [
  { name: 'Alice Smith', email: 'alice@test.com', city: 'NYC' },
  { name: 'Alice Smith', email: 'alice.smith@test.com', city: 'NYC' },
  { name: 'Bob Jones', email: 'bob@test.com', city: 'LA' },
  { name: 'Charlie Brown', email: 'charlie@test.com', city: 'SF' },
];

const largeRecords = Array.from({ length: 1000 }, (_, i) => ({
  id: String(i),
  name: `Name${i % 100}`,
  value: (i * 7) % 997,
}));

// ═══════════════════════════════════════════════════════════════
// DuckDbSqlBackend
// ═══════════════════════════════════════════════════════════════

describe('DuckDbSqlBackend', () => {
  it('creates and queries in-memory database', async () => {
    const db = new DuckDbSqlBackend();
    const rows = await db.query('SELECT 1 AS val');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.val).toBe(1);
    await db.close();
  });

  it('exec DDL statements', async () => {
    const db = new DuckDbSqlBackend();
    await db.exec('CREATE TABLE test_exec (id INTEGER, name VARCHAR)');
    await db.exec("INSERT INTO test_exec VALUES (1, 'hello')");
    const rows = await db.query('SELECT * FROM test_exec');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('hello');
    await db.close();
  });

  it('createTempTable loads records with __row_id__', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(testRecords, { name: 'test_people' });
    const rows = await db.query('SELECT * FROM test_people ORDER BY __row_id__');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.__row_id__).toBe(0);
    expect(rows[0]!.name).toBe('Alice Smith');
    expect(rows[3]!.__row_id__).toBe(3);
    await db.dropTempTable('test_people');
    await db.close();
  });

  it('createTempTable with custom columns', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(testRecords, {
      name: 'test_custom',
      columns: ['name', 'city'],
    });
    const rows = await db.query('SELECT * FROM test_custom ORDER BY __row_id__');
    expect(rows[0]!).toHaveProperty('name');
    expect(rows[0]!).toHaveProperty('city');
    expect(rows[0]!).not.toHaveProperty('email');
    await db.close();
  });

  it('createTempTable handles empty records gracefully', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable([], { name: 'empty_table' });
    await db.close();
  });

  it('createTempTable handles null and undefined values', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(
      [
        { name: 'Alice', email: null },
        { name: undefined, email: 'bob@test.com' },
      ],
      { name: 'test_nulls' },
    );
    const rows = await db.query('SELECT * FROM test_nulls ORDER BY __row_id__');
    expect(rows).toHaveLength(2);
    await db.close();
  });

  it('createTempTable handles special characters in values', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(
      [{ name: "O'Brien", city: "N'Awlins" }],
      { name: 'test_special' },
    );
    const rows = await db.query(
      "SELECT * FROM test_special WHERE name LIKE 'O''Brien'",
    );
    expect(rows).toHaveLength(1);
    await db.close();
  });

  it('query returns empty array for no results', async () => {
    const db = new DuckDbSqlBackend();
    const rows = await db.query('SELECT * FROM (SELECT 1) WHERE 1=0');
    expect(rows).toHaveLength(0);
    await db.close();
  });

  it('dropTempTable removes table', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(testRecords, { name: 'to_drop' });
    await db.dropTempTable('to_drop');
    await expect(db.query('SELECT * FROM to_drop')).rejects.toThrow();
    await db.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// SQL Blocking
// ═══════════════════════════════════════════════════════════════

describe('sqlBlocking', () => {
  it('generates candidate pairs with single rule', async () => {
    const result = await sqlBlocking(testRecords, backend, {
      rules: ['l.name = r.name'],
    });
    expect(result.totalRecords).toBe(4);
    expect(result.pairs.length).toBeGreaterThan(0);
    const alicePair = result.pairs.find(
      (p) =>
        (p.leftId === 0 && p.rightId === 1) ||
        (p.leftId === 1 && p.rightId === 0),
    );
    expect(alicePair).toBeDefined();
  });

  it('generates candidate pairs with multiple rules (UNION)', async () => {
    const result = await sqlBlocking(testRecords, backend, {
      rules: ['l.name = r.name', 'l.city = r.city'],
    });
    expect(result.pairs.length).toBeGreaterThan(0);
  });

  it('deduplication prevents self-pairs and duplicates', async () => {
    const result = await sqlBlocking(testRecords, backend, {
      rules: ['l.name = r.name'],
      deduplicate: true,
    });
    const selfPairs = result.pairs.filter((p) => p.leftId === p.rightId);
    expect(selfPairs).toHaveLength(0);
    const seen = new Set<string>();
    for (const p of result.pairs) {
      const key = `${Math.min(p.leftId, p.rightId)}:${Math.max(p.leftId, p.rightId)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('handles empty rules gracefully', async () => {
    const result = await sqlBlocking(testRecords, backend, { rules: [] });
    expect(result.pairs).toHaveLength(0);
    expect(result.totalRecords).toBe(4);
  });

  it('handles empty records gracefully', async () => {
    const result = await sqlBlocking([], backend, {
      rules: ['l.name = r.name'],
    });
    expect(result.pairs).toHaveLength(0);
    expect(result.totalRecords).toBe(0);
  });

  it('large dataset completes without OOM', async () => {
    const db = new DuckDbSqlBackend();
    const result = await sqlBlocking(largeRecords, db, {
      rules: ['l.name = r.name'],
    });
    expect(result.totalRecords).toBe(1000);
    expect(result.pairs.length).toBeGreaterThan(0);
    expect(result.reductionRatio).toBeGreaterThan(0);
    await db.close();
  }, 30000);

  it('maxPairs limits results', async () => {
    const db = new DuckDbSqlBackend();
    const result = await sqlBlocking(largeRecords, db, {
      rules: ['l.name = r.name'],
      maxPairs: 50,
    });
    expect(result.pairs.length).toBeLessThanOrEqual(50);
    await db.close();
  }, 30000);

  it('handles integer value comparison', async () => {
    const recs = [
      { id: '1', val: '100' },
      { id: '2', val: '100' },
      { id: '3', val: '200' },
    ];
    const result = await sqlBlocking(recs, backend, {
      rules: ['l.val = r.val'],
    });
    expect(result.pairs.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// ISqlBackend interface compliance
// ═══════════════════════════════════════════════════════════════

describe('ISqlBackend interface compliance', () => {
  it('DuckDbSqlBackend implements all ISqlBackend methods', () => {
    const db = new DuckDbSqlBackend();
    expect(typeof db.query).toBe('function');
    expect(typeof db.createTempTable).toBe('function');
    expect(typeof db.dropTempTable).toBe('function');
    expect(typeof db.exec).toBe('function');
    expect(typeof db.close).toBe('function');
  });

  it('close() releases resources', async () => {
    const db = new DuckDbSqlBackend();
    await db.close();
    await db.close();
  });
});
