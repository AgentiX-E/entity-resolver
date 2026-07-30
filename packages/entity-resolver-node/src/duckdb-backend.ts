/**
 * Node.js DuckDB Backend — ISqlBackend using duckdb npm package.
 *
 * Uses CJS interop (duckdb is a CJS module). All SQL operations are
 * wrapped in async Promises with sequential execution via `db.all()`.
 *
 * duckdb npm package: https://www.npmjs.com/package/duckdb
 */
import type { ISqlBackend, SqlRow, TempTableConfig } from '@agentix-e/entity-resolver-core';

// duckdb is CJS-only — use createRequire for reliable import
import { createRequire } from 'module';
const duckdb = createRequire(import.meta.url)('duckdb') as {
  Database: new (path: string) => DuckDBInstance;
};

interface DuckDBInstance {
  all(sql: string, cb: (err: Error | null, rows: SqlRow[]) => void): void;
  exec(sql: string, cb: (err: Error | null) => void): void;
  close(cb: () => void): void;
}

export class NodeDuckDBBackend implements ISqlBackend {
  private db: DuckDBInstance;

  constructor(connectionString = ':memory:') {
    this.db = new duckdb.Database(connectionString);
  }

  async query(sql: string): Promise<SqlRow[]> {
    return this._all(sql);
  }

  async createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void> {
    const cols = config.columns ?? Object.keys(records[0] ?? {});
    const colDefs = cols.map((c) => `"${c}" VARCHAR`).join(', ');
    await this._all(`CREATE TABLE ${config.name} (${colDefs})`);

    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const values = batch
        .map(
          (r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`,
        )
        .join(', ');
      await this._all(`INSERT INTO ${config.name} VALUES ${values}`);
    }
  }

  async streamToTable(
    source: AsyncIterable<Record<string, unknown>>,
    config: TempTableConfig,
    batchSize = 1000,
  ): Promise<void> {
    const cols = config.columns ?? [];
    const colDefs = cols.map((c) => `"${c}" VARCHAR`).join(', ');
    await this._all(`CREATE TABLE ${config.name} (${colDefs})`);

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
    const rows = await this._all(`SELECT COUNT(*) AS cnt FROM ${tableName}`);
    return Number(rows[0]?.cnt ?? 0);
  }

  async dropTempTable(name: string): Promise<void> {
    await this._all(`DROP TABLE IF EXISTS ${name}`);
  }

  async exec(sql: string): Promise<void> {
    await this._all(sql);
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }

  private _all(sql: string): Promise<SqlRow[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, (err: Error | null, rows: SqlRow[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
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
    await this._all(`INSERT INTO ${table} VALUES ${values}`);
  }
}
