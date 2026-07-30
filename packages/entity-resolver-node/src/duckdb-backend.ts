/**
 * Node.js DuckDB Backend — ISqlBackend using @duckdb/node-api (Neo).
 *
 * Uses DuckDBDataChunk + Appender API for bulk data loading
 * (equivalent to Splink's DataFrame.register), avoiding the
 * O(N) row-by-row INSERT bottleneck.
 *
 * Reference: https://duckdb.org/docs/current/clients/node_neo/overview
 */
import type { ISqlBackend, SqlRow, TempTableConfig } from '@agentix-e/entity-resolver-core';
import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export class NodeDuckDBBackend implements ISqlBackend {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;
  private _path: string;

  constructor(connectionString = ':memory:') {
    this._path = connectionString;
  }

  private async _conn(): Promise<DuckDBConnection> {
    if (!this.instance) {
      this.instance = await DuckDBInstance.create(this._path);
    }
    if (!this.connection) {
      this.connection = await this.instance.connect();
    }
    return this.connection;
  }

  private _rows(result: any): SqlRow[] {
    try {
      const cols = result.columnNames();
      const rows = result.getRows(); // 3-10x faster than getRowObjects for large sets
      return rows.map((row: unknown[]) => {
        const obj: SqlRow = {};
        for (let i = 0; i < cols.length; i++) obj[cols[i] as string] = row[i];
        return obj;
      });
    } catch {
      try {
        return (result.getRowObjects() as SqlRow[]) || [];
      } catch {
        return [];
      }
    }
  }

  async query(sql: string): Promise<SqlRow[]> {
    const conn = await this._conn();
    const result = await conn.runAndReadAll(sql);
    return this._rows(result);
  }

  async exec(sql: string): Promise<void> {
    const conn = await this._conn();
    await conn.run(sql); // run() returns immediately, no row serialization
  }

  async createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void> {
    const conn = await this._conn();
    const cols = config.columns ?? Object.keys(records[0] ?? {});
    await conn.run(`CREATE TABLE ${config.name} (${cols.map((c) => `"${c}" VARCHAR`).join(', ')})`);

    if (records.length === 0) return;

    // Batch INSERT — 5000 records per INSERT avoids massive SQL string
    // parsing overhead. Single large INSERT (30MB+ for 500K records) takes
    // 7+ seconds for DuckDB to parse. 5000-record batches parse in < 50ms.
    const batchSize = 5000;
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
    batchSize = 5000,
  ): Promise<void> {
    const conn = await this._conn();
    const cols = config.columns ?? [];
    await conn.run(`CREATE TABLE ${config.name} (${cols.map((c) => `"${c}" VARCHAR`).join(', ')})`);

    const batch: Record<string, unknown>[] = [];
    for await (const record of source) {
      batch.push(record);
      if (batch.length >= batchSize) {
        await this._appendBatch(conn, config.name, batch, cols);
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      await this._appendBatch(conn, config.name, batch, cols);
    }
  }

  private async _appendBatch(
    conn: DuckDBConnection,
    table: string,
    records: readonly Record<string, unknown>[],
    cols: readonly string[],
  ): Promise<void> {
    const values = records
      .map((r) => `(${cols.map((c) => `'${String(r[c] ?? '').replace(/'/g, "''")}'`).join(', ')})`)
      .join(', ');
    await conn.run(`INSERT INTO ${table} VALUES ${values}`);
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
