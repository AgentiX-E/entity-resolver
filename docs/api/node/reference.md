# @agentix-e/entity-resolver-node

**Node.js adapters** for entity-resolver-core. Provides filesystem, database, and SQL backends.

## Backends

| Backend | Purpose |
|---------|---------|
| `FileDataSource` | Read CSV/JSON files via IDataSource |
| `DuckDBStore` | Embedded DuckDB entity storage |
| `PgEntityStore` | PostgreSQL entity storage with mTLS |
| `DuckDbSqlBackend` | DuckDB SQL execution (ISqlBackend) |
| `PgSqlBackend` | PostgreSQL SQL execution (ISqlBackend) |
| `MemoryEntityStore` | Pure JS Map (built into core) |

## Quick Start

```typescript
import { resolveStorage, DuckDbSqlBackend } from '@agentix-e/entity-resolver-node';
import { runPipeline, autoConfigure } from '@agentix-e/entity-resolver-core';

// Storage backend
const { store } = await resolveStorage({ backend: 'duckdb' });

// SQL backend for large datasets
const backend = new DuckDbSqlBackend({ path: ':memory:' });
```

## License

MIT © Lambertyan
