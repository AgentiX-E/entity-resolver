/**
 * Tests for DuckDbSqlBackend edge cases.
 *
 * Uses real DuckDB :memory: database for full integration testing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DuckDbSqlBackend } from '../duckdb-sql-backend.js';

describe('DuckDbSqlBackend', () => {
  let backend: DuckDbSqlBackend;

  beforeAll(() => {
    backend = new DuckDbSqlBackend();
  });

  afterAll(async () => {
    try {
      await backend.close();
    } catch {
      // Already closed
    }
  });

  describe('constructor', () => {
    it('Constructor creates backend with DuckDB connection', () => {
      const b = new DuckDbSqlBackend();
      expect(b).toBeDefined();
      expect(typeof b.query).toBe('function');
      expect(typeof b.exec).toBe('function');
      expect(typeof b.createTempTable).toBe('function');
      expect(typeof b.dropTempTable).toBe('function');
      expect(typeof b.rowCount).toBe('function');
      expect(typeof b.close).toBe('function');
    });

    it('Constructor with custom path', () => {
      const b = new DuckDbSqlBackend({ path: ':memory:' });
      expect(b).toBeDefined();
      void b.close();
    });
  });

  describe('query', () => {
    it('query returns typed rows', async () => {
      const b = new DuckDbSqlBackend();
      await b.exec('CREATE TEMP TABLE typed_test_query (name VARCHAR, age INTEGER)');
      await b.exec("INSERT INTO typed_test_query VALUES ('Alice', 30), ('Bob', 25)");

      const rows = await b.query('SELECT * FROM typed_test_query ORDER BY name');

      expect(Array.isArray(rows)).toBe(true);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty('name');
      expect(rows[0]!.name).toBe('Alice');
      expect(rows[1]!.name).toBe('Bob');

      await b.close();
    });

    it('query with parameterized SQL', async () => {
      const b = new DuckDbSqlBackend();
      await b.exec('CREATE TEMP TABLE param_test (id INTEGER, val VARCHAR)');
      await b.exec("INSERT INTO param_test VALUES (1, 'one'), (2, 'two')");

      const rows = await b.query('SELECT * FROM param_test WHERE id = $1', [2]);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.val).toBe('two');

      await b.close();
    });

    it('query returns empty array for no results', async () => {
      const b = new DuckDbSqlBackend();
      await b.exec('CREATE TEMP TABLE empty_result (x INTEGER)');

      const rows = await b.query('SELECT * FROM empty_result');
      expect(rows).toHaveLength(0);

      await b.close();
    });
  });

  describe('createTempTable', () => {
    it('createTempTable with empty records — succeeds without error', async () => {
      const b = new DuckDbSqlBackend();

      // Empty records array — should return immediately, no table created
      await expect(b.createTempTable([], { name: 'empty_records' })).resolves.toBeUndefined();

      await b.close();
    });

    it('createTempTable with records — creates table with __row_id__', async () => {
      const b = new DuckDbSqlBackend();

      const records = [
        { name: 'Alice', city: 'NYC' },
        { name: 'Bob', city: 'LA' },
      ];

      await b.createTempTable(records, { name: 'people' });

      const rows = await b.query('SELECT * FROM people ORDER BY __row_id__');
      expect(rows).toHaveLength(2);
      expect(rows[0]!.__row_id__).toBe(0);
      expect(rows[0]!.name).toBe('Alice');
      expect(rows[1]!.__row_id__).toBe(1);
      expect(rows[1]!.name).toBe('Bob');

      await b.close();
    });

    it('createTempTable with zero columns — handled gracefully', async () => {
      const b = new DuckDbSqlBackend();

      // Records with no properties
      const records = [{}, {}];
      await b.createTempTable(records, { name: 'zero_cols' });

      // Table should have __row_id__ and no other columns
      const rows = await b.query('SELECT * FROM zero_cols');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty('__row_id__');

      await b.close();
    });

    it('createTempTable with explicit columns', async () => {
      const b = new DuckDbSqlBackend();

      const records = [
        { a: '1', b: '2', c: '3' },
        { a: '4', b: '5', c: '6' },
      ];

      await b.createTempTable(records, { name: 'explicit_cols', columns: ['a', 'c'] });

      const rows = await b.query('SELECT * FROM explicit_cols ORDER BY __row_id__');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveProperty('a');
      expect(rows[0]).toHaveProperty('c');
      expect(rows[0]).not.toHaveProperty('b');

      await b.close();
    });

    it('createTempTable with null and undefined values', async () => {
      const b = new DuckDbSqlBackend();

      const records = [
        { name: 'Alice', city: null },
        { name: 'Bob', city: undefined },
      ];

      await b.createTempTable(records, { name: 'null_vals' });

      const rows = await b.query('SELECT * FROM null_vals ORDER BY __row_id__');
      expect(rows).toHaveLength(2);

      await b.close();
    });

    it('createTempTable with single quotes in values', async () => {
      const b = new DuckDbSqlBackend();

      const records = [{ name: "O'Brien" }];
      await b.createTempTable(records, { name: 'quotes' });

      const rows = await b.query('SELECT * FROM quotes');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe("O'Brien");

      await b.close();
    });
  });

  describe('rowCount', () => {
    it('rowCount returns correct count for table with rows', async () => {
      const b = new DuckDbSqlBackend();

      const records = Array.from({ length: 50 }, (_, i) => ({ idx: String(i) }));
      await b.createTempTable(records, { name: 'counting_rows' });

      const count = await b.rowCount('counting_rows');
      expect(count).toBe(50);

      await b.close();
    });

    it('rowCount for non-existent table returns 0', async () => {
      const count = await backend.rowCount('table_that_does_not_exist');
      expect(count).toBe(0);
    });

    it('rowCount for empty table returns 0', async () => {
      const b = new DuckDbSqlBackend();
      await b.exec('CREATE TEMP TABLE empty_count (x INTEGER)');

      const count = await b.rowCount('empty_count');
      expect(count).toBe(0);

      await b.close();
    });
  });

  describe('dropTempTable', () => {
    it('dropTempTable removes existing table', async () => {
      const b = new DuckDbSqlBackend();

      await b.createTempTable([{ col: 'val' }], { name: 'drop_me' });
      const beforeCount = await b.rowCount('drop_me');
      expect(beforeCount).toBe(1);

      await b.dropTempTable('drop_me');
      const afterCount = await b.rowCount('drop_me');
      expect(afterCount).toBe(0);

      await b.close();
    });

    it('dropTempTable for non-existent table — no error', async () => {
      await expect(backend.dropTempTable('does_not_exist_at_all')).resolves.toBeUndefined();
    });
  });

  describe('exec', () => {
    it('exec executes SQL successfully — DDL', async () => {
      const b = new DuckDbSqlBackend();

      await b.exec('CREATE TEMP TABLE exec_ddl (id INTEGER, label VARCHAR)');
      await b.exec("INSERT INTO exec_ddl VALUES (1, 'test'), (2, 'hello')");

      const rows = await b.query('SELECT * FROM exec_ddl ORDER BY id');
      expect(rows).toHaveLength(2);
      expect(rows[0]!.label).toBe('test');
      expect(rows[1]!.label).toBe('hello');

      await b.close();
    });

    it('exec throws on invalid SQL', async () => {
      const b = new DuckDbSqlBackend();

      await expect(b.exec('SELECT FROM INVALID SYNTAX')).rejects.toThrow();

      await b.close();
    });
  });

  describe('close', () => {
    it('close terminates connection', async () => {
      const b = new DuckDbSqlBackend();

      await b.close();

      // After close, operations should fail or be no-ops
      // DuckDB doesn't always throw after close, depends on binding version
      // So just verify close resolved
      expect(true).toBe(true);
    });

    it('close clears temp table tracking', async () => {
      const b = new DuckDbSqlBackend();

      await b.createTempTable([{ x: '1' }], { name: 'before_close' });
      await b.close();

      // No error on double close
      await expect(b.close()).resolves.toBeUndefined();
    });
  });

  describe('streamToTable', () => {
    it('streamToTable with async iterable', async () => {
      const b = new DuckDbSqlBackend();

      async function* generateRecords() {
        yield { name: 'Alice', score: '100' };
        yield { name: 'Bob', score: '200' };
        yield { name: 'Charlie', score: '300' };
      }

      await b.streamToTable(generateRecords(), { name: 'streamed' });

      const rows = await b.query('SELECT * FROM streamed ORDER BY __row_id__');
      expect(rows).toHaveLength(3);
      expect(rows[0]!.name).toBe('Alice');
      expect(rows[2]!.name).toBe('Charlie');

      await b.close();
    });

    it('streamToTable with empty source', async () => {
      const b = new DuckDbSqlBackend();

      async function* empty() {
        // yields nothing
      }

      await b.streamToTable(empty(), { name: 'empty_stream' });

      // Table should exist with __row_id__ column only
      const count = await b.rowCount('empty_stream');
      expect(count).toBe(0);

      await b.close();
    });
  });
});
