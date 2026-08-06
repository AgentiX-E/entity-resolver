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

// SQL Backend
export type { DuckDbSqlBackendConfig } from './storage/duckdb-sql-backend.js';
export { DuckDbSqlBackend } from './storage/duckdb-sql-backend.js';
export type { PgSqlBackendConfig } from './storage/pg-sql-backend.js';
export { PgSqlBackend } from './storage/pg-sql-backend.js';
// Embedding providers

export { TransformersEmbeddingProvider } from './embedding/transformers-provider.js';
export type { TransformersEmbeddingsConfig } from './embedding/transformers-provider.js';


export { ApiEmbeddingProvider } from './embedding/api-provider.js';

// LLM Adapter
export { LLMAdapter } from './pipeline/llm-adapter.js';
export type { ILLMAdapter, LLMModelConfig, LMPair, LMPairVerdict } from '@agentix-e/entity-resolver-core';
export {
  simpleMatchPrompt,
  fewShotMatchPrompt,
  standardMatchParser,
  deepSeekV4FlashConfig,
  glm4Config,
  glm4FlashConfig,
} from '@agentix-e/entity-resolver-core';
