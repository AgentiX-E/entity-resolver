# @agentix-e/entity-resolution-browser

**Browser adapters — DuckDB WASM store with 4-tier enterprise distribution.**

## Installation

```bash
npm install @agentix-e/entity-resolution-browser
```

## Key Modules

| Module | Description |
|--------|-------------|
| DuckDB WASM Store | DuckDB WASM with OPFS persistence and 4-tier distribution |

## Quick Example

```typescript
import { DuckDBWasmStore } from '@agentix-e/entity-resolution-browser';

const store = new DuckDBWasmStore();
await store.initialize();
await store.upsertEntity({ id: '1', fields: { name: 'John' } });
```

## Complete API Reference

→ [Full auto-generated API reference](/api/browser/reference)
