/**
 * Node.js DuckDB Backend — ISqlBackend using @duckdb/node-api (Neo).
 *
 * Uses a single persistent DuckDB connection with explicit flush
 * after DDL operations to ensure table visibility.
 *
 * Reference: https://duckdb.org/docs/current/clients/node_neo/overview
 */
import type { ISqlBackend, SqlRow, TempTableConfig } from '@agentix-e/entity-resolver-core';
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

export class NodeDuckDBBackend implements ISqlBackend {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private _path: string;

  constructor(connectionString = ':memory:') {
    this._path = connectionString;
  }

  /** Gets or creates a persistent connection. */
  private async _conn(): Promise<DuckDBConnection> {
    if (!this.instance) {
      this.instance = await DuckDBInstance.create(this._path);
    }
    if (!this.connection) {
      this.connection = await this.instance.connect();
    }
    return this.connection;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _rows(result: any): SqlRow[] {
    try {
      return result.getRowObjects() as SqlRow[];
    } catch {
      return [];
    }
  }

  async query(sql: string): Promise<SqlRow[]> {
    const conn = await this._conn();
    const result = await conn.runAndReadAll(sql);
    return this._rows(result);
  }

  async exec(sql: string): Promise<void> {
    const conn = await this._conn();
    // Use runAndReadAll for DDL to ensure execution completes
    await conn.runAndReadAll(sql);
  }

  async createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void> {
    const conn = await this._conn();
    const cols = config.columns ?? Object.keys(records[0] ?? {});
    await conn.run(`CREATE TABLE ${config.name} (${cols.map((c) => `"${c}" VARCHAR`).join(', ')})`);

    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const values = batch
        .map(
          (r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`,
        )
        .join(', ');
      await conn.run(`INSERT INTO ${config.name} VALUES ${values}`);
    }
  }

  async streamToTable(
    source: AsyncIterable<Record<string, unknown>>,
    config: TempTableConfig,
    batchSize = 1000,
  ): Promise<void> {
    const conn = await this._conn();
    const cols = config.columns ?? [];
    await conn.run(`CREATE TABLE ${config.name} (${cols.map((c) => `"${c}" VARCHAR`).join(', ')})`);
    const batch: Record<string, unknown>[] = [];
    for await (const record of source) {
      batch.push(record);
      if (batch.length >= batchSize) {
        await conn.run(
          `INSERT INTO ${config.name} VALUES ${batch
            .map(
              (r) =>
                `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`,
            )
            .join(', ')}`,
        );
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      await conn.run(
        `INSERT INTO ${config.name} VALUES ${batch
          .map(
            (r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`,
          )
          .join(', ')}`,
      );
    }
  }

  async rowCount(tableName: string): Promise<number> {
    const conn = await this._conn();
    const result = await conn.runAndReadAll(`SELECT COUNT(*) AS cnt FROM ${tableName}`);
    return Number(this._rows(result)[0]?.cnt ?? 0);
  }

  async dropTempTable(name: string): Promise<void> {
    const conn = await this._conn();
    await conn.run(`DROP TABLE IF EXISTS ${name}`);
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.closeSync();
      this.connection = null;
    }
    this.instance = null;
  }
}
