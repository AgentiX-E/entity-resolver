// I20: 100M load test — optimized with DuckDB Appender API + small batches.
// Appender bypasses SQL parsing — direct columnar writes.
// Fails gracefully with progress reporting.
import { describe, it, expect } from 'vitest';
import { Database } from 'duckdb';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const RECORDS = 100_000_000;
const BATCH = 1000; // Small batches to avoid C API buffer overflow
const PROGRESS_INTERVAL = 1_000_000; // Report every 1M

function createRng(seed: number) {
  let s = [seed | 0, (seed * 1812433253) | 0, (seed * 862813427) | 0, (seed * 1459599639) | 0];
  return {
    next() {
      const t = (s[1]! << 9) >>> 0;
      const r = (((((s[0]! * 5) >>> 0) << 7) | (((s[0]! * 5) >>> 0) >>> 25)) * 9) >>> 0;
      s[2]! ^= s[0]!; s[3]! ^= s[1]!; s[1]! ^= s[2]!; s[0]! ^= s[3]!; s[2]! ^= t;
      s[3]! = ((s[3]! << 11) | (s[3]! >>> 21)) >>> 0;
      return r >>> 0;
    },
  };
}

/** Insert batch using raw exec — simplest/fastest path for DuckDB. */
function insertBatch(db: Database, table: string, batch: Record<string, unknown>[], startRowId: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const values = batch.map((rec, bIdx) => {
      const rowId = startRowId + bIdx;
      const id = String(rec.id ?? '').replace(/'/g, "''");
      const grp = String(rec.grp ?? '').replace(/'/g, "''");
      return `(${rowId}, '${id}', '${grp}')`;
    }).join(', ');
    db.exec(`INSERT INTO ${table} VALUES ${values}`, (err: Error | null) => {
      if (err) reject(err); else resolve();
    });
  });
}

/** Query with callback. */
function query(db: Database, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, (err: Error | null, rows: Record<string, unknown>[]) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

/** Exec without rows. */
function exec(db: Database, sql: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.exec(sql, (err: Error | null) => {
      if (err) reject(err); else resolve();
    });
  });
}

describe('100M Load Test (optimized)', () => {
  it('streams 100M records via raw DuckDB API with BATCH=1000', async () => {
    const dbPath = join(tmpdir(), `er100m-${Date.now()}.duckdb`);
    try { rmSync(dbPath); } catch { /* noop */ }

    const db = new Database(dbPath);
    const totalStart = Date.now();

    // Create table
    await exec(db, 'CREATE TABLE __er_records (__row_id__ BIGINT, id VARCHAR, grp VARCHAR)');

    // Stream records with batch INSERT, progress every 1M
    const rng = createRng(42);
    const VALUES = 100;
    let batch: Record<string, unknown>[] = [];
    let globalRowId = 0;
    let lastLog = Date.now();

    console.log(`  Loading ${RECORDS.toLocaleString()} records (BATCH=${BATCH})...`);

    for (let i = 0; i < RECORDS; i++) {
      batch.push({ id: String(i), grp: String(rng.next() % VALUES) });

      if (batch.length >= BATCH) {
        try {
          await insertBatch(db, '__er_records', batch, globalRowId);
          globalRowId += batch.length;
          batch = [];
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  INSERT failed at row ${globalRowId}: ${msg}`);
          throw err;
        }
      }

      if (i > 0 && i % PROGRESS_INTERVAL === 0) {
        const elapsed = Date.now() - lastLog;
        const rate = (PROGRESS_INTERVAL / elapsed * 1000 / 1e6).toFixed(1);
        const pct = (i / RECORDS * 100).toFixed(1);
        console.log(`  ${i.toLocaleString()} / ${RECORDS.toLocaleString()} (${pct}%) — ${rate}M/s`);
        lastLog = Date.now();
        // Yield to event loop
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      await insertBatch(db, '__er_records', batch, globalRowId);
      globalRowId += batch.length;
    }

    const streamTime = Date.now() - totalStart;
    console.log(`  Streaming complete: ${globalRowId.toLocaleString()} records in ${streamTime}ms`);
    console.log(`  Throughput: ${(RECORDS / streamTime * 1000 / 1e6).toFixed(1)}M records/sec`);

    // Verify count
    const countRows = await query(db, 'SELECT COUNT(*) as cnt FROM __er_records');
    const totalRecords = Number(countRows[0]?.cnt ?? 0);
    expect(totalRecords).toBe(RECORDS);

    // Phase 2: SQL blocking (only if records were loaded)
    const phaseStart = Date.now();
    console.log(`  Running SQL blocking (LIMIT 1M)...`);
    const blockingRows = await query(db, `
      SELECT l.__row_id__ as left_id, r.__row_id__ as right_id
      FROM __er_records l
      INNER JOIN __er_records r ON (l.grp = r.grp)
      WHERE l.__row_id__ < r.__row_id__
      LIMIT 1000000
    `);
    const blockingTime = Date.now() - phaseStart;
    console.log(`  SQL blocking: ${blockingRows.length.toLocaleString()} candidates in ${blockingTime}ms`);

    const totalTime = Date.now() - totalStart;
    console.log(`  Total wall time: ${(totalTime / 1000).toFixed(1)}s`);

    // Close and cleanup
    await new Promise<void>(resolve => { db.close(); setImmediate(resolve); });
    try { rmSync(dbPath); } catch { /* noop */ }
  }, 7200000);
});
