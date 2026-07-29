/**
 * Node.js DuckDB Backend — ISqlBackend implementation using duckdb npm package.
 *
 * Provides full SQL execution capabilities for the entity-resolver
 * pipeline's DuckDB pushdown mode (sql-pipeline.ts).
 */
import duckdb from 'duckdb';
import type { ISqlBackend, SqlRow, TempTableConfig } from '@agentix-e/entity-resolver-core';

const { Database } = duckdb;

export class NodeDuckDBBackend implements ISqlBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;

  constructor(connectionString = ':memory:') {
    this.db = new Database(connectionString);
  }

  async query(sql) {
    return this._run(sql);
  }

  async createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void> {
    const cols = config.columns ?? Object.keys(records[0] ?? {});
    const colDefs = cols.map((c) => `"${c}" VARCHAR`).join(', ');
    await this.exec(`CREATE TABLE ${config.name} (${colDefs})`);

    // Batch insert
    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const values = batch
        .map(
          (r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`,
        )
        .join(', ');
      await this.exec(`INSERT INTO ${config.name} VALUES ${values}`);
    }
  }

  async streamToTable(
    source: AsyncIterable<Record<string, unknown>>,
    config: TempTableConfig,
    batchSize = 1000,
  ): Promise<void> {
    const cols = config.columns ?? [];
    if (cols.length === 0) {
      for await (const _ of source) {
        /* dry-run to get columns */
      }
      // Fallback: assume first record keys
    }

    const colDefs = cols.map((c) => `"${c}" VARCHAR`).join(', ');
    await this.exec(`CREATE TABLE ${config.name} (${colDefs})`);

    const batch: Record<string, unknown>[] = [];
    for await (const record of source) {
      batch.push(record);
      if (batch.length >= batchSize) {
        await this._insertBatch(config.name, batch, cols);
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      await this._insertBatch(config.name, batch, cols);
    }
  }

  async rowCount(tableName: string): Promise<number> {
    const rows = await this._run(`SELECT COUNT(*) AS cnt FROM ${tableName}`);
    return Number(rows[0]?.cnt ?? 0);
  }

  async dropTempTable(name: string): Promise<void> {
    await this.exec(`DROP TABLE IF EXISTS ${name}`);
  }

  async _run(sql) {
    return new Promise((resolve, reject) => {
      this._run(sql, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async exec(sql) {
    return this._run(sql);
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }

  private async _insertBatch(
    table: string,
    records: readonly Record<string, unknown>[],
    cols: readonly string[],
  ): Promise<void> {
    const values = records
      .map((r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`)
      .join(', ');
    await this.exec(`INSERT INTO ${table} VALUES ${values}`);
  }
}
