// IConfigStore — configuration persistence contract for entity-resolver.
// Implemented by: MemoryConfigStore (core).

import type { PipelineConfig } from '../pipeline/runner.js';

/**
 * A serializable configuration for an entity resolution pipeline run.
 * Wraps PipelineConfig with metadata for cataloging.
 */
export interface StoredConfig {
  readonly name: string;
  readonly config: PipelineConfig;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Persistence contract for pipeline configurations.
 * Enables saving, loading, and listing named configurations
 * across runs — critical for reproducible entity resolution workflows.
 */
export interface IConfigStore {
  /** Load a named configuration. Returns null if not found. */
  load(name: string): Promise<StoredConfig | null>;

  /** Save (upsert) a named configuration. */
  save(name: string, config: PipelineConfig): Promise<void>;

  /** List all saved configuration names. */
  list(): Promise<string[]>;

  /** Delete a named configuration. Idempotent. */
  delete(name: string): Promise<void>;
}
