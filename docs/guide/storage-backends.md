# Storage Backends

Choose the right storage backend for your entity resolution deployment.

## Backend Comparison

| Backend | Package | Environment | Persistence | Scale | Latency | Dependencies |
|---------|---------|-------------|-------------|-------|---------|-------------|
| **In-Memory** | `core` | Universal | ❌ None | < 100K entities | < 1ms | None |
| **DuckDB Embedded** | `node` | Node.js | ✅ File | < 10M entities | ~1ms | duckdb |
| **PostgreSQL** | `node` | Node.js | ✅ Database | > 100M entities | ~5ms | pg |
| **DuckDB WASM** | `browser` | Browser | ✅ OPFS | < 1M entities | ~5ms | @duckdb/duckdb-wasm |

## Decision Tree

```
Start Here
  │
  ├─ Need persistence?
  │   ├─ No → In-Memory (zero deps, instant setup)
  │   └─ Yes →
  │       ├─ Browser environment?
  │       │   └─ DuckDB WASM (OPFS persistence, enterprise distribution)
  │       └─ Node.js environment?
  │           ├─ < 10M entities, simple setup?
  │           │   └─ DuckDB Embedded (single-file, zero infra)
  │           └─ > 10M entities, multi-tenant, HA?
  │               └─ PostgreSQL (connection pooling, mTLS, replication)
```

## In-Memory Store

**Best for**: Prototyping, testing, serverless functions, small datasets.

```typescript
import { MemoryEntityStore } from '@agentix-e/entity-resolution-core';

const store = new MemoryEntityStore();
await store.upsertEntity({ id: '1', fields: { name: 'John', city: 'NYC' } });
const entity = await store.getEntity('1');
```

| Pro | Con |
|-----|-----|
| Zero dependencies | No persistence |
| Instant setup | Memory-bound |
| Works everywhere | Lost on process restart |

## DuckDB Embedded (Node.js)

**Best for**: Single-machine deployments, analytics workloads, offline-first apps.

```typescript
import { DuckDBStore } from '@agentix-e/entity-resolution-node';

const store = new DuckDBStore({ dbPath: './er.db' });
await store.upsertEntity({ id: '1', fields: { name: 'John', city: 'NYC' } });
await store.applyMerge('2', '1');
```

| Pro | Con |
|-----|-----|
| Single-file database | Single-writer (OLAP design) |
| Zero infrastructure | Not multi-tenant |
| SQL queryable | < 10M entities practical limit |
| Columnar storage | |

## PostgreSQL with mTLS

**Best for**: Production multi-tenant deployments, high availability, large scale.

```typescript
import { PgEntityStore, buildPoolConfig } from '@agentix-e/entity-resolution-node';

const tlsConfig = {
  ca: fs.readFileSync('/etc/ssl/ca.pem'),
  cert: fs.readFileSync('/etc/ssl/client-cert.pem'),
  key: fs.readFileSync('/etc/ssl/client-key.pem'),
};

const poolConfig = buildPoolConfig({
  host: 'pg.example.com',
  port: 5432,
  database: 'er_production',
  user: 'er_service',
  password: process.env.PG_PASSWORD!,
  tls: tlsConfig,
});

const store = new PgEntityStore(poolConfig);
```

| Pro | Con |
|-----|-----|
| Horizontal scalability | Requires PostgreSQL infrastructure |
| Connection pooling | ~5ms latency per query |
| mTLS encryption | Setup complexity |
| > 100M entities | |
| Built-in replication | |

### Schema

The PostgreSQL schema is predefined:

```sql
CREATE TABLE IF NOT EXISTS entities (
  id          TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entity_graph (
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  relation    TEXT NOT NULL DEFAULT 'same_as',
  PRIMARY KEY (source_id, target_id)
);
```

## DuckDB WASM (Browser)

**Best for**: Client-side ER in the browser, offline-capable web apps.

```typescript
import { DuckDBWasmStore } from '@agentix-e/entity-resolution-browser';

const store = new DuckDBWasmStore({
  bundle: {
    mvp: 'https://cdn.example.com/duckdb-eh.wasm',
    eh: 'https://cdn.example.com/duckdb-mvp.wasm',
  },
});

await store.initialize();
const health = store.getInitResult(); // monitor bundle source used
```

### 4-Tier Enterprise Distribution

The DuckDB WASM store uses a 4-tier bundle resolution strategy for maximum enterprise compatibility:

| Tier | Source | Use Case |
|------|--------|----------|
| 1. Bundled | npm package `dist/` | Default, works offline |
| 2. Custom URL | Configurable `bundle` option | Enterprise CDN, air-gapped |
| 3. GitHub Assets | github.com/duckdb/duckdb-wasm releases | Automatic fallback |
| 4. In-Memory | Pure JS entities only | Last-resort when WASM unavailable |

```typescript
// Tier 2 example: custom enterprise CDN
const store = new DuckDBWasmStore({
  bundle: {
    mvp: 'https://cdn.corp.internal/duckdb/1.29.0/duckdb-eh.wasm',
    eh: 'https://cdn.corp.internal/duckdb/1.29.0/duckdb-mvp.wasm',
  },
  fallbackToGitHubAssets: false, // strict: only use custom URL
});
```

| Pro | Con |
|-----|-----|
| Client-side, zero server cost | ~5ms latency |
| OPFS persistence | Browser-only |
| 4-tier enterprise distro | < 1M entities practical limit |
| Offline-capable | WASM bundle ~30MB |
