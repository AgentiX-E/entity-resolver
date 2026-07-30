/**
 * Node.js DuckDB Backend — ISqlBackend using duckdb npm package (CJS).
 *
 * Uses a serial execution queue to work around DuckDB node binding's
 * async consistency issues with db.all() in :memory: mode.
 */
import type { ISqlBackend, SqlRow, TempTableConfig } from '@agentix-e/entity-resolver-core';
import { createRequire } from 'module';

const duckdb = createRequire(import.meta.url)('duckdb') as {
  Database: new (p: string) => {
    all(s: string, cb: (e: Error | null, r: SqlRow[]) => void): void;
    exec(s: string, cb: (e: Error | null) => void): void;
    close(cb: () => void): void;
  };
};

export class NodeDuckDBBackend implements ISqlBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private _q: Promise<unknown> = Promise.resolve();

  constructor(connectionString = ':memory:') {
    this.db = new duckdb.Database(connectionString);
  }

  private _serial<T>(fn: () => Promise<T>): Promise<T> {
    this._q = this._q.then(fn, fn);
    return this._q as Promise<T>;
  }

  private _all(sql: string): Promise<SqlRow[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, (err: Error | null, rows: SqlRow[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  private _exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async query(sql: string): Promise<SqlRow[]> {
    return this._serial(() => this._all(sql));
  }

  async exec(sql: string): Promise<void> {
    return this._serial(() => this._exec(sql));
  }

  async rowCount(tableName: string): Promise<number> {
    return this._serial(async () => {
      const rows = await this._all(`SELECT COUNT(*) AS cnt FROM ${tableName}`);
      return Number(rows[0]?.cnt ?? 0);
    });
  }

  async dropTempTable(name: string): Promise<void> {
    return this._serial(() => this._exec(`DROP TABLE IF EXISTS ${name}`));
  }

  async createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void> {
    return this._serial(async () => {
      const cols = config.columns ?? Object.keys(records[0] ?? {});
      const colDefs = cols.map((c) => `"${c}" VARCHAR`).join(', ');
      await this._exec(`CREATE TABLE ${config.name} (${colDefs})`);

      const batchSize = 500;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const values = batch
          .map(
            (r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`,
          )
          .join(', ');
        await this._exec(`INSERT INTO ${config.name} VALUES ${values}`);
      }
    });
  }

  async streamToTable(
    source: AsyncIterable<Record<string, unknown>>,
    config: TempTableConfig,
    batchSize = 1000,
  ): Promise<void> {
    return this._serial(async () => {
      const cols = config.columns ?? [];
      const colDefs = cols.map((c) => `"${c}" VARCHAR`).join(', ');
      await this._exec(`CREATE TABLE ${config.name} (${colDefs})`);

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
    });
  }

  async close(): Promise<void> {
    return this._serial(() => new Promise<void>((resolve) => this.db.close(() => resolve())));
  }

  private async _insertBatch(
    table: string,
    records: readonly Record<string, unknown>[],
    cols: readonly string[],
  ): Promise<void> {
    const values = records
      .map((r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`)
      .join(', ');
    await this._exec(`INSERT INTO ${table} VALUES ${values}`);
  }
}
