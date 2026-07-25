/**
 * PostgreSQL SQL backend for entity-resolver.
 *
 * Implements ISqlBackend using the `pg` driver for real PostgreSQL
 * wire-protocol connections with connection pooling.
 *
 * Supports:
 * - Parameterized queries ($1, $2, ...) via native pg placeholders
 * - Temp table creation with __row_id__ column
 * - Streaming INSERT (reuses createTempTable's batch logic)
 * - Transaction-safe cleanup (tables auto-drop on connection close)
 */

import type { ISqlBackend, SqlRow, TempTableConfig } from '@agentix-e/entity-resolver-core';
import { IOError } from '@agentix-e/entity-resolver-core';
import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

/** PostgreSQL connection configuration. */
export interface PgSqlBackendConfig {
  /** PostgreSQL connection pool config. */
  readonly pool: PoolConfig;
}

/**
 * PostgreSQL SQL backend.
 *
 * Uses connection pooling for production workloads.
 * All temp tables are session-scoped (automatically dropped on disconnect).
 */
export class PgSqlBackend implements ISqlBackend {
  private pool: Pool;
  private tempTables = new Set<string>();

  constructor(config: PgSqlBackendConfig) {
    this.pool = new Pool({
      ...config.pool,
      max: config.pool.max ?? 10,
      idleTimeoutMillis: config.pool.idleTimeoutMillis ?? 30000,
    });
  }

  async query(sql: string, params?: unknown[]): Promise<SqlRow[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params ?? []);
      return result.rows as SqlRow[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new IOError(`PostgreSQL query failed: ${msg}`, {
        operation: 'PgSqlBackend.query',
        details: { sql: sql.slice(0, 200) },
      });
    } finally {
      client.release();
    }
  }

  async createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void> {
    const name = config.name;
    this.tempTables.add(name);

    const client = await this.pool.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS ${name}`);
      const columns = config.columns ?? Object.keys(records[0] ?? {});
      const colDefs = ['__row_id__ INTEGER', ...columns.map((c) => `${c} TEXT`)].join(', ');

      await client.query(`CREATE TEMP TABLE ${name} (${colDefs}) ON COMMIT DROP`);

      if (records.length === 0) return;

      // Batch insert
      const BATCH = 1000;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const placeholders = batch
          .map(
            (_, rowIdx) =>
              `($${rowIdx * (columns.length + 1) + 1}, ${columns.map((_, colIdx) => `$${rowIdx * (columns.length + 1) + colIdx + 2}`).join(', ')})`,
          )
          .join(', ');

        const flatParams: unknown[] = [];
        for (let r = 0; r < batch.length; r++) {
          flatParams.push(i + r); // __row_id__
          for (const col of columns) {
            flatParams.push(batch[r]?.[col] ?? null);
          }
        }

        await client.query(
          `INSERT INTO ${name} (__row_id__, ${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders}`,
          flatParams,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new IOError(`PostgreSQL createTempTable failed: ${msg}`, {
        operation: 'PgSqlBackend.createTempTable',
      });
    } finally {
      client.release();
    }
  }

  async streamToTable(
    source: AsyncIterable<Record<string, unknown>>,
    config: TempTableConfig,
    batchSize: number = 1000,
  ): Promise<void> {
    // For PostgreSQL, stream records in batches
    const batch: Record<string, unknown>[] = [];
    for await (const rec of source) {
      batch.push(rec);
      if (batch.length >= batchSize) {
        // Flush batch via createTempTable's INSERT
        if (!this.tempTables.has(config.name)) {
          // First batch: create table
          await this.createTempTable(batch, config);
        } else {
          // Subsequent batches: INSERT into existing table
          await this.appendBatch(config.name, batch, [...(config.columns ?? Object.keys(batch[0] ?? {}))], batch.length);
        }
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      if (!this.tempTables.has(config.name)) {
        await this.createTempTable(batch, config);
      } else {
        await this.appendBatch(config.name, batch, [...(config.columns ?? Object.keys(batch[0] ?? {}))], batch.length);
      }
    }
  }

  private async appendBatch(
    table: string,
    records: Record<string, unknown>[],
    columns: string[],
    startRowId: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const placeholders = records
        .map(
          (_, rowIdx) =>
            `($${rowIdx * (columns.length + 1) + 1}, ${columns.map((_, colIdx) => `$${rowIdx * (columns.length + 1) + colIdx + 2}`).join(', ')})`,
        )
        .join(', ');

      const flatParams: unknown[] = [];
      for (let r = 0; r < records.length; r++) {
        flatParams.push(startRowId + r);
        for (const col of columns) {
          flatParams.push(records[r]?.[col] ?? null);
        }
      }

      await client.query(
        `INSERT INTO ${table} (__row_id__, ${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders}`,
        flatParams,
      );
    } finally {
      client.release();
    }
  }

  async rowCount(tableName: string): Promise<number> {
    try {
      const rows = await this.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
      return Number(rows[0]?.cnt ?? 0);
    } catch {
      return 0;
    }
  }

  async dropTempTable(name: string): Promise<void> {
    this.tempTables.delete(name);
    try {
      await this.exec(`DROP TABLE IF EXISTS ${name}`);
    } catch {
      // Table may already be dropped
    }
  }

  async exec(sql: string): Promise<void> {
    await this.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.tempTables.clear();
  }
}
