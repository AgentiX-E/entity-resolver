# @agentix-e/entity-resolution-node

**Node.js runtime adapter — storage backends with mTLS and DuckDB.**

## Installation

```bash
npm install @agentix-e/entity-resolution-node
```

## Key Modules

| Module | Description |
|--------|-------------|
| DuckDB Store | DuckDB embedded store with JSON-based member storage |
| PostgreSQL Store | PostgreSQL store with mTLS support and connection pooling |
| Storage Resolver | Auto-detection of available backends with graceful degradation |

## Quick Example

```typescript
import { resolveStorage } from '@agentix-e/entity-resolution-node';

const storage = await resolveStorage({ prefer: 'duckdb', fallback: 'memory' });
await storage.upsertEntity({ id: '1', fields: { name: 'John' } });
```

## Complete API Reference

→ [Full auto-generated API reference](/api/node/reference)
