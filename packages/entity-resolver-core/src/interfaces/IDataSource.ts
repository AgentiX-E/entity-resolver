/**
 * Data source interface for streaming entity resolution.
 *
 * Enables the pipeline to process datasets larger than memory by
 * consuming records via async iteration instead of materializing
 * everything into a single array.
 *
 * Core package defines only this interface contract —
 * implementations live in node/browser/server packages.
 */

/** Options for reading data from a source. */
export interface ReadOptions {
  /** Maximum number of records to read (undefined = all). */
  readonly limit?: number;
  /** Number of records to skip before reading. */
  readonly offset?: number;
  /** Fields to include (undefined = all). */
  readonly fields?: readonly string[];
}

/** Contract for pluggable data sources. */
export interface IDataSource {
  /**
   * Read records as an async iterable.
   *
   * Implementations may stream from files, databases, APIs, etc.
   * The iterable may be consumed only once — callers should collect
   * records into an array if multiple passes are needed.
   */
  read(options?: ReadOptions): AsyncIterable<Record<string, unknown>>;

  /** Return the full dataset size (may be estimated for lazy sources). */
  estimatedCount(): Promise<number>;
}
