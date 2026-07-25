/**
 * ISqlBackend — SQL execution contract for entity-resolver.
 *
 * Enables the pipeline to offload blocking, comparison, and parameter
 * estimation to native SQL engines (DuckDB, PostgreSQL, Spark, etc.)
 * instead of materializing all pairs in JavaScript memory.
 *
 * Core package defines only this interface contract —
 * implementations live in node/browser/server packages.
 *
 * Design principle: same DI pattern as IDataSource/IEntityStore —
 * core defines the contract, platform packages provide the engine.
 */

/** A row returned from a SQL query. */
export type SqlRow = Record<string, unknown>;

/** Configuration for a temporary table loaded from records. */
export interface TempTableConfig {
  /** Table name (must be unique within a session). */
  readonly name: string;
  /** Column definitions (for CREATE TABLE). Inferred from first record if omitted. */
  readonly columns?: readonly string[];
}

/** Options for SQL-based blocking. */
export interface SqlBlockingConfig {
  /** Blocking rules as SQL WHERE clauses (e.g., 'l.name = r.name'). */
  readonly rules: readonly string[];
  /** Whether to deduplicate (l.id < r.id) within each rule. Default: true. */
  readonly deduplicate?: boolean;
  /** Max pairs to return. Default: no limit. */
  readonly maxPairs?: number;
}

/** Contract for pluggable SQL execution engines. */
export interface ISqlBackend {
  /**
   * Execute a SQL query and return rows.
   *
   * @param sql — SQL query string (parameterized with $1, $2, ...)
   * @param params — bound parameter values
   * @returns Array of rows as Record<string, unknown>
   */
  query(sql: string, params?: unknown[]): Promise<SqlRow[]>;

  /**
   * Create a temporary table from an array of records.
   * The table is automatically dropped when the backend is closed.
   *
   * @param records — records to insert
   * @param config — table name and optional column definitions
   */
  createTempTable(
    records: readonly Record<string, unknown>[],
    config: TempTableConfig,
  ): Promise<void>;

  /**
   * Drop a temporary table.
   */
  dropTempTable(name: string): Promise<void>;

  /**
   * Execute a raw SQL statement (DDL, INSERT, etc.) without returning rows.
   */
  exec(sql: string): Promise<void>;

  /**
   * Close the backend and release all resources.
   * All temporary tables are dropped.
   */
  close(): Promise<void>;
}
