// @agentix-e/entity-resolution-node
// Node.js runtime adapter — storage backends with mTLS support.

// PostgreSQL storage with mTLS
export type { PgTlsConfig, PgStoreConfig } from './storage/pg-store.js';
export { PgEntityStore, ER_SCHEMA_SQL, buildPoolConfig } from './storage/pg-store.js';

// Storage resolution
export type { ResolvedStorage } from './storage-resolver.js';
export { resolveStorage } from './storage-resolver.js';
