// @agentix-e/entity-resolver-browser
// Browser runtime adapter — DuckDB WASM storage + Web Worker pool.

export { DuckDBWasmStore } from './storage/duckdb-wasm-store.js';
export type { DuckDBWasmOptions, DuckDBWasmInitResult } from './storage/duckdb-wasm-store.js';

export { BrowserWorkerPool } from './worker-pool.js';
