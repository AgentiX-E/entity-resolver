// Storage resolver — factory that selects and initializes the appropriate
// IEntityStore backend based on configuration.

import type { IEntityStore } from '@agentix-e/entity-resolver-core';
import { MemoryEntityStore } from '@agentix-e/entity-resolver-core';

/** Storage backends supported by the resolver. */
export type StorageBackend = 'duckdb' | 'postgres' | 'memory';

/** Resolved storage with metadata about the active backend. */
export interface ResolvedStorage {
  readonly backend: StorageBackend;
  readonly store: IEntityStore;
}

/** Options for the DuckDB backend. */
export interface DuckDBOptions {
  readonly path?: string;
}

/** Options for the PostgreSQL backend. */
export interface PgOptions {
  readonly host?: string;
  readonly port?: number;
  readonly database: string;
  readonly user?: string;
  readonly password?: string;
}

/** Resolver configuration. */
export interface StorageResolverOptions {
  readonly backend?: StorageBackend;
  readonly duckdbPath?: string;
  readonly pgConfig?: PgOptions;
}

/**
 * Resolve and initialize the appropriate storage backend.
 *
 * Selection logic:
 * - 'duckdb' → DuckDBStore (embedded database, falls back to memory on failure)
 * - 'postgres' → PgEntityStore (full PostgreSQL with mTLS, falls back to memory on failure)
 * - 'memory' (default) → MemoryEntityStore (pure JS Map)
 */
export async function resolveStorage(options?: StorageResolverOptions): Promise<ResolvedStorage> {
  const backend = options?.backend ?? 'memory';

  if (backend === 'duckdb') {
    try {
      const { DuckDBStore } = await import('./storage/duckdb-store.js');
      const config = options?.duckdbPath ? { path: options.duckdbPath } : {};
      const store = await DuckDBStore.create(config);
      return { backend: 'duckdb', store };
    } catch {
      return { backend: 'memory', store: new MemoryEntityStore() };
    }
  }

  if (backend === 'postgres') {
    try {
      const { PgEntityStore } = await import('./storage/pg-store.js');
      const pgConfig = options?.pgConfig;
      const store = await PgEntityStore.create({
        database: pgConfig?.database ?? 'postgres',
        ...(pgConfig?.host ? { host: pgConfig.host } : {}),
        ...(pgConfig?.port ? { port: pgConfig.port } : {}),
        ...(pgConfig?.user ? { user: pgConfig.user } : {}),
        ...(pgConfig?.password ? { password: pgConfig.password } : {}),
      });
      return { backend: 'postgres', store };
    } catch {
      return { backend: 'memory', store: new MemoryEntityStore() };
    }
  }

  return { backend: 'memory', store: new MemoryEntityStore() };
}
