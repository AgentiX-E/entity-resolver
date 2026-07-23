// @agentix-e/entity-resolver-node
// Node.js runtime adapter — storage backends with mTLS and DuckDB.

// PostgreSQL storage with mTLS
export type { PgTlsConfig, PgStoreConfig } from './storage/pg-store.js';
export { PgEntityStore, ER_SCHEMA_SQL, buildPoolConfig } from './storage/pg-store.js';

// DuckDB embedded storage
export type { DuckDBStoreConfig } from './storage/duckdb-store.js';
export { DuckDBStore } from './storage/duckdb-store.js';

// Storage resolution
export type { ResolvedStorage } from './storage-resolver.js';
export { resolveStorage } from './storage-resolver.js';
