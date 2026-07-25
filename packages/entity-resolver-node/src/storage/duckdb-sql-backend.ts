/**
 * DuckDB SQL backend for entity-resolver.
 *
 * Implements ISqlBackend using DuckDB's Node.js native binding.
 * Provides full SQL execution (query, DDL, DML) with automatic
 * row-ID column injection for blocking queries.
 *
 * DuckDB is an embedded OLAP database — zero setup, zero external
 * processes. Same binary used in browser (WASM) and Node.js (native).
 */

import type { ISqlBackend, SqlRow, TempTableConfig } from '@agentix-e/entity-resolver-core';
import { IOError } from '@agentix-e/entity-resolver-core';
import { Database } from 'duckdb';

/** Default configuration for DuckDB backend. */
export interface DuckDbSqlBackendConfig {
  /** Database path. ':memory:' for in-memory (default). */
  readonly path?: string;
  /** Enable DuckDB extensions (e.g., 'fts', 'json'). */
  readonly extensions?: readonly string[];
}

/**
 * DuckDB SQL backend — embedded analytical database.
 *
 * Features:
 * - In-memory or file-backed storage
 * - Automatic __row_id__ column injection on temp tables
 * - Columnar execution engine (fast for analytics workloads)
 * - Same binary as browser DuckDB WASM (cross-platform compatibility)
 */
export class DuckDbSqlBackend implements ISqlBackend {
  private db: Database;
  private tempTables = new Set<string>();

  constructor(config: DuckDbSqlBackendConfig = {}) {
    const path = config.path ?? ':memory:';
    this.db = new Database(path);
    // Load extensions if requested
    if (config.extensions) {
      for (const ext of config.extensions) {
        this.exec(`INSTALL ${ext}; LOAD ${ext};`);
      }
    }
  }

  /**
   * Execute a parameterized SQL query and return rows.
   * Supports $1, $2, ... positional parameters.
   */
  async query(sql: string, params?: unknown[]): Promise<SqlRow[]> {
    return new Promise((resolve, reject) => {
      // Replace $N parameters with escaped values for DuckDB API
      const finalSql = params
        ? this.interpolateParams(sql, params)
        : sql;

      this.db.all(finalSql, (err: Error | null, rows: SqlRow[]) => {
        if (err) {
          reject(new IOError(`DuckDB query failed: ${err.message}`, {
            operation: 'DuckDbSqlBackend.query',
            details: { sql: sql.slice(0, 200) },
          }));
          return;
        }
        resolve(rows);
      });
    });
  }

  /**
   * Create a temporary table from an array of records.
   * Automatically adds a __row_id__ column for blocking queries.
   */
  async createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void> {
    if (records.length === 0) return;

    const name = config.name;
    this.tempTables.add(name);

    // Drop if exists
    await this.exec(`DROP TABLE IF EXISTS ${name}`);

    // Infer columns from first record if not specified
    const columns = config.columns ?? Object.keys(records[0]!);
    const colDefs = ['__row_id__ INTEGER', ...columns.map((c) => `${c} VARCHAR`)].join(', ');

    await this.exec(`CREATE TEMP TABLE ${name} (${colDefs})`);

    // Batch insert in chunks of 1000 to avoid giant SQL strings
    const BATCH_SIZE = 1000;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const values = batch
        .map((rec, batchIdx) => {
          const rowId = i + batchIdx;
          const vals = columns.map((col) => {
            const val = rec[col];
            if (val === null || val === undefined) return 'NULL';
            // Escape single quotes
            const str = String(val).replace(/'/g, "''");
            return `'${str}'`;
          });
          return `(${rowId}, ${vals.join(', ')})`;
        })
        .join(', ');

      await this.exec(`INSERT INTO ${name} VALUES ${values}`);
    }
  }

  /**
   * Drop a temporary table.
   */
  async dropTempTable(name: string): Promise<void> {
    this.tempTables.delete(name);
    await this.exec(`DROP TABLE IF EXISTS ${name}`);
  }

  /**
   * Stream records from an AsyncIterable into a temp table.
   * Batches INSERT statements to control memory — O(batch) not O(N).
   */
  async streamToTable(
    source: AsyncIterable<Record<string, unknown>>,
    config: TempTableConfig,
    batchSize: number = 1000,
  ): Promise<void> {
    const name = config.name;
    this.tempTables.add(name);

    // Peek first record to infer columns
    let columns: string[] | null = null;
    let firstRecord: Record<string, unknown> | null = null;

    // Collect first batch + infer schema
    const batch: Record<string, unknown>[] = [];
    let globalRowId = 0;

    for await (const rec of source) {
      if (!firstRecord) {
        firstRecord = rec;
        columns = (config.columns ?? Object.keys(rec)) as string[];
        const resolvedColumns = columns as string[];
        const colDefs = ['__row_id__ INTEGER', ...resolvedColumns.map((c: string) => `${c} VARCHAR`)].join(', ');
        await this.exec(`DROP TABLE IF EXISTS ${name}`);
        await this.exec(`CREATE TEMP TABLE ${name} (${colDefs})`);
      }
      batch.push(rec);

      if (batch.length >= batchSize) {
        await this.insertBatch(name, batch, columns!, globalRowId);
        globalRowId += batch.length;
        batch.length = 0;
      }
    }

    // Flush remaining batch
    if (batch.length > 0 && columns) {
      await this.insertBatch(name, batch, columns, globalRowId);
    } else if (!firstRecord) {
      await this.exec(`DROP TABLE IF EXISTS ${name}`);
      await this.exec(`CREATE TEMP TABLE ${name} (__row_id__ INTEGER)`);
    }
  }

  /**
   * Return the number of rows in a table.
   */
  async rowCount(tableName: string): Promise<number> {
    try {
      const rows = await this.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
      return Number(rows[0]?.cnt ?? 0);
    } catch {
      return 0; // Table doesn't exist — count is 0
    }
  }

  /**
   * Insert a batch of records into a temp table.
   * @param table — table name
   * @param records — batch of records
   * @param columns — column names
   * @param startRowId — starting __row_id__ for this batch
   */
  private async insertBatch(
    table: string,
    records: Record<string, unknown>[],
    columns: string[],
    startRowId: number,
  ): Promise<void> {
    const values = records
      .map((rec, batchIdx) => {
        const rowId = startRowId + batchIdx;
        const vals = columns.map((col) => {
          const val = rec[col];
          if (val === null || val === undefined) return 'NULL';
          const str = String(val).replace(/'/g, "''").replace(/\\/g, '\\\\');
          return `'${str}'`;
        });
        return `(${rowId}, ${vals.join(', ')})`;
      })
      .join(', ');

    await this.exec(`INSERT INTO ${table} VALUES ${values}`);
  }

  /**
   * Execute a raw SQL statement.
   */
  async exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err: Error | null) => {
        if (err) {
          reject(
            new IOError(`DuckDB exec failed: ${err.message}`, {
              operation: 'DuckDbSqlBackend.exec',
              details: { sql: sql.slice(0, 200) },
            }),
          );
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Close the backend and release all DuckDB resources.
   * All temporary tables are dropped automatically.
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close();
      this.tempTables.clear();
      resolve();
    });
  }

  /**
   * Simple parameter interpolation for DuckDB API.
   * DuckDB's Node.js API doesn't natively support parameterized queries,
   * so we inline values with proper escaping.
   */
  private interpolateParams(sql: string, params: unknown[]): string {
    let result = sql;
    for (let i = 0; i < params.length; i++) {
      const placeholder = `$${i + 1}`;
      const value = params[i];
      const escaped = this.escapeValue(value);
      result = result.replace(placeholder, escaped);
    }
    return result;
  }

  private escapeValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}
