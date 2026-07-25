// Tests for streaming IDataSource → DuckDB integration.
// Validates streaming record loading, row counting, batch batching,
// and end-to-end SQL pipeline execution.
import { describe, it, expect } from 'vitest';
import { DuckDbSqlBackend } from '../../storage/duckdb-sql-backend.js';
import type { ComparisonSpec } from '@agentix-e/entity-resolver-core';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Create an async iterable from an array with optional delay between chunks. */
async function* arrayToIterable<T>(
  items: T[],
  chunkSize: number = 100,
  delayMs: number = 0,
): AsyncIterable<T> {
  for (let i = 0; i < items.length; i += chunkSize) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    yield* items.slice(i, i + chunkSize);
  }
}

function generateRecords(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    name: `Name${i % 20}`,
    city: `City${i % 10}`,
    value: String((i * 7) % 100),
  }));
}

// ═══════════════════════════════════════════════════════════════
// streamToTable
// ═══════════════════════════════════════════════════════════════

describe('DuckDbSqlBackend streamToTable', () => {
  it('streams records from async iterable into table', async () => {
    const db = new DuckDbSqlBackend();
    const records = generateRecords(500);
    const source = arrayToIterable(records, 100);

    await db.streamToTable(source, { name: 'streaming_test' });
    const count = await db.rowCount('streaming_test');
    expect(count).toBe(500);

    // Verify __row_id__ is sequential
    const rows = await db.query(
      'SELECT __row_id__ FROM streaming_test ORDER BY __row_id__ LIMIT 5',
    );
    expect(rows[0]!.__row_id__).toBe(0);
    expect(rows[4]!.__row_id__).toBe(4);

    await db.close();
  });

  it('handles small batch size', async () => {
    const db = new DuckDbSqlBackend();
    const records = generateRecords(50);
    const source = arrayToIterable(records, 5);

    await db.streamToTable(source, { name: 'small_batch' }, 5);
    const count = await db.rowCount('small_batch');
    expect(count).toBe(50);
    await db.close();
  });

  it('handles empty async iterable', async () => {
    const db = new DuckDbSqlBackend();
    const source = arrayToIterable([], 10);

    await db.streamToTable(source, { name: 'empty_stream' });
    const count = await db.rowCount('empty_stream');
    expect(count).toBe(0);
    await db.close();
  });

  it('handles null and undefined values in stream', async () => {
    const db = new DuckDbSqlBackend();
    const records = [
      { name: 'Alice', email: null },
      { name: undefined, email: 'bob@test.com' },
      { name: 'Charlie', email: 'charlie@test.com' },
    ];
    const source = arrayToIterable(records, 2);

    await db.streamToTable(source, { name: 'nulls_stream' });
    const rows = await db.query('SELECT * FROM nulls_stream ORDER BY __row_id__');
    expect(rows).toHaveLength(3);
    await db.close();
  });

  it('maintains global __row_id__ across batches', async () => {
    const db = new DuckDbSqlBackend();
    const records = generateRecords(250);
    const source = arrayToIterable(records, 50);

    await db.streamToTable(source, { name: 'rowid_test' }, 50);
    // Last record should have __row_id__ = 249
    const lastRow = await db.query(
      'SELECT __row_id__ FROM rowid_test ORDER BY __row_id__ DESC LIMIT 1',
    );
    expect(lastRow[0]!.__row_id__).toBe(249);
    await db.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// rowCount
// ═══════════════════════════════════════════════════════════════

describe('DuckDbSqlBackend rowCount', () => {
  it('returns correct count after streamToTable', async () => {
    const db = new DuckDbSqlBackend();
    const source = arrayToIterable(generateRecords(333), 100);

    await db.streamToTable(source, { name: 'count_test' });
    expect(await db.rowCount('count_test')).toBe(333);
    await db.close();
  });

  it('returns 0 for empty table', async () => {
    const db = new DuckDbSqlBackend();
    await db.exec('CREATE TABLE empty_table (x INTEGER)');
    expect(await db.rowCount('empty_table')).toBe(0);
    await db.close();
  });

  it('returns 0 for non-existent table', async () => {
    const db = new DuckDbSqlBackend();
    expect(await db.rowCount('nonexistent')).toBe(0);
    await db.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// Streaming + SQL blocking integration
// ═══════════════════════════════════════════════════════════════

describe('streaming + SQL blocking integration', () => {
  it('stream then block produces correct pairs', async () => {
    const db = new DuckDbSqlBackend();
    const records = [
      { name: 'Alice', city: 'NYC' },
      { name: 'Alice', city: 'LA' },
      { name: 'Bob', city: 'NYC' },
      { name: 'Bob', city: 'SF' },
    ];
    const source = arrayToIterable(records, 2);

    // Stream records into SQL
    await db.streamToTable(source, { name: '__er_records' });

    // Block using SQL
    const dedupeClause = 'l.__row_id__ < r.__row_id__';
    const sql = `
      SELECT l.__row_id__ as left_id, r.__row_id__ as right_id
      FROM __er_records l
      INNER JOIN __er_records r ON (l.name = r.name)
      WHERE ${dedupeClause}`;

    const rows = await db.query(sql);

    // Alice at 0,1 → should get pair (0,1)
    const alicePair = rows.find(
      (r) => (r.left_id === 0 && r.right_id === 1) || (r.left_id === 1 && r.right_id === 0),
    );
    expect(alicePair).toBeDefined();

    // Bob at 2,3 → should get pair (2,3)
    const bobPair = rows.find(
      (r) => (r.left_id === 2 && r.right_id === 3) || (r.left_id === 3 && r.right_id === 2),
    );
    expect(bobPair).toBeDefined();

    await db.close();
  });

  it('stream 1K records then block without OOM', async () => {
    const db = new DuckDbSqlBackend();
    const records = generateRecords(1000);
    const source = arrayToIterable(records, 200);

    await db.streamToTable(source, { name: '__er_records' });

    const dedupeClause = 'l.__row_id__ < r.__row_id__';
    const sql = `
      SELECT l.__row_id__ as left_id, r.__row_id__ as right_id
      FROM __er_records l
      INNER JOIN __er_records r ON (l.name = r.name)
      WHERE ${dedupeClause}`;

    const rows = await db.query(sql);
    expect(rows.length).toBeGreaterThan(0);

    await db.close();
  }, 30000);
});

// ═══════════════════════════════════════════════════════════════
// runPipelineFromSqlSource E2E
// ═══════════════════════════════════════════════════════════════

describe('runPipelineFromSqlSource E2E', () => {
  const specs: ComparisonSpec[] = [
    {
      field: 'name',
      scorerName: 'exact',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'not_match', threshold: 0.0 },
      ],
    },
  ];

  it('completes pipeline from streaming source', async () => {
    const { runPipelineFromSqlSource } = await import(
      '@agentix-e/entity-resolver-core'
    );

    const records = [
      { name: 'Alice', city: 'NYC' },
      { name: 'Alice', city: 'LA' },
      { name: 'Bob', city: 'NYC' },
      { name: 'Bob', city: 'SF' },
    ];
    const source = arrayToIterable(records, 2);

    const result = await runPipelineFromSqlSource(source, {
      backend: new DuckDbSqlBackend(),
      pipeline: {
        blocking: { passes: [] },
        comparisons: specs,
        matchThreshold: 0.5,
      },
      sqlRules: ['l.name = r.name'],
    });

    expect(result.statistics.totalRecords).toBe(4);
    expect(result.statistics.totalClusters).toBeGreaterThanOrEqual(0);
    expect(result.statistics.executionTimeMs).toBeGreaterThan(0);
  }, 30000);

  it('handles empty streaming source', async () => {
    const { runPipelineFromSqlSource } = await import(
      '@agentix-e/entity-resolver-core'
    );

    const source = arrayToIterable([], 10);

    const result = await runPipelineFromSqlSource(source, {
      backend: new DuckDbSqlBackend(),
      pipeline: {
        blocking: { passes: [] },
        comparisons: specs,
        matchThreshold: 0.5,
      },
      sqlRules: ['l.name = r.name'],
    });

    expect(result.statistics.totalRecords).toBe(0);
    expect(result.clusters.size).toBe(0);
  }, 30000);

  it('handles zero candidates gracefully', async () => {
    const { runPipelineFromSqlSource } = await import(
      '@agentix-e/entity-resolver-core'
    );

    // Records with unique names → no matches
    const records = [
      { name: 'Unique_1', city: 'NYC' },
      { name: 'Unique_2', city: 'LA' },
    ];
    const source = arrayToIterable(records, 2);

    const result = await runPipelineFromSqlSource(source, {
      backend: new DuckDbSqlBackend(),
      pipeline: {
        blocking: { passes: [] },
        comparisons: specs,
        matchThreshold: 0.5,
      },
      sqlRules: ['l.name = r.name'],
    });

    expect(result.statistics.totalRecords).toBe(2);
    // All records should be singletons (no pairs)
    expect(result.singletons.length).toBe(2);
  }, 30000);
});
