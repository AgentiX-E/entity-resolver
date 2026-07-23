# Production Deployment

Deploy `@agentix-e/entity-resolver` in production with confidence.

## Deployment Modes

| Mode | Description | Best For |
|------|-------------|----------|
| **Embedded Library** | Import core + node packages directly | Microservices, existing Node.js apps |
| **Docker Container** | Prebuilt Docker image with REST API | Containerized infrastructure, Kubernetes |
| **Serverless** | Core-only (stateless, zero I/O) | AWS Lambda, Cloudflare Workers, Vercel Edge |

## Docker Deployment

### Build

```dockerfile
# Multi-stage Docker build — see docker/Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/packages/entity-resolver-server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t entity-resolver:latest -f docker/Dockerfile .
docker run -p 3000:3000 \
  -e DEEPSEEK_API_KEY=sk-xxx \
  -e DATABASE_URL=postgresql://user:pass@host:5432/erdb \
  entity-resolver:latest
```

## REST API Server

The server package provides a Hono-based REST API:

```typescript
import { createApp } from '@agentix-e/entity-resolver-server';

const app = createApp({
  port: 3000,
  auth: {
    type: 'bearer',
    tokens: [process.env.API_TOKEN!],
  },
  rateLimit: {
    windowMs: 60_000,
    max: 100,
  },
});

// Endpoints:
// POST /api/dedupe      — run deduplication pipeline
// POST /api/match       — match two records
// GET  /api/health      — health check with uptime and memory
// GET  /api/entities/:id — retrieve entity by ID
```

### Health Endpoint

```json
{
  "status": "ok",
  "uptime": 86400,
  "memory": {
    "heapUsed": 52428800,
    "heapTotal": 1073741824
  },
  "version": "0.1.0"
}
```

## Authentication

The server supports **Bearer token authentication** out of the box:

```typescript
import { createAuthMiddleware } from '@agentix-e/entity-resolver-server';

const auth = createAuthMiddleware({
  type: 'bearer',
  tokens: ['sk-prod-abc123', 'sk-prod-def456'],
});

// Apply to all routes or specific routes
app.use('/api/*', auth);
```

## Rate Limiting

Protect your API with configurable rate limiting:

```typescript
import { createRateLimitMiddleware, startBucketCleanup } from '@agentix-e/entity-resolver-server';

const rateLimit = createRateLimitMiddleware({
  windowMs: 60_000,   // 1 minute window
  max: 100,           // 100 requests per window
  keyGenerator: (req) => req.headers.get('x-api-key') ?? req.ip,
});

app.use('/api/*', rateLimit);

// Cleanup expired buckets every 5 minutes
startBucketCleanup(5 * 60_000);
```

## PostgreSQL with mTLS

For production deployments requiring encrypted database connections:

```typescript
import { PgEntityStore, buildPoolConfig } from '@agentix-e/entity-resolver-node';
import { readFileSync } from 'node:fs';

const poolConfig = buildPoolConfig({
  host: process.env.PG_HOST!,
  port: parseInt(process.env.PG_PORT ?? '5432'),
  database: process.env.PG_DATABASE!,
  user: process.env.PG_USER!,
  password: process.env.PG_PASSWORD!,
  tls: {
    ca: readFileSync('/etc/ssl/certs/ca-cert.pem'),
    cert: readFileSync('/etc/ssl/certs/client-cert.pem'),
    key: readFileSync('/etc/ssl/private/client-key.pem'),
  },
  max: 20,              // pool max connections
  idleTimeoutMillis: 30_000,
});
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | For LLM scorer | — | DeepSeek API key (never in code) |
| `DATABASE_URL` | For PostgreSQL | — | PostgreSQL connection string |
| `PG_HOST` | For PostgreSQL | `localhost` | PostgreSQL host |
| `PG_PORT` | For PostgreSQL | `5432` | PostgreSQL port |
| `PG_DATABASE` | For PostgreSQL | — | Database name |
| `PG_USER` | For PostgreSQL | — | Database user |
| `PG_PASSWORD` | For PostgreSQL | — | Database password |
| `API_TOKEN` | For server auth | — | Bearer token for API access |
| `NODE_ENV` | No | `development` | Environment mode |
| `PORT` | No | `3000` | Server listen port |

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/health
# {"status":"ok","uptime":86400,"memory":{...},"version":"0.1.0"}
```

### WASM Initialization Status

```typescript
const store = new DuckDBWasmStore({ /* config */ });
const health = store.getInitResult();
// {
//   success: true,
//   source: 'bundled',    // tier used
//   db: DuckDB instance,
//   conn: DuckDBConnection,
// }
```

## Performance Tuning

1. **Use WASM acceleration**: Ensure WASM binaries are available for ~5x scoring speedup
2. **Choose blocking strategy wisely**: Standard blocking for clean data, multi-pass for high recall
3. **Set appropriate thresholds**: Lower threshold = higher recall, higher threshold = higher precision
4. **Pre-process data**: Clean, normalize, and strip before matching
5. **Use connection pooling**: PostgreSQL pool `max: 20` for concurrent requests
6. **Cache EM parameters**: Reuse `estimateParameters` output across pipeline runs

## Security Checklist

- [ ] API tokens stored in environment variables, never in code
- [ ] PostgreSQL connections use mTLS in production
- [ ] Rate limiting enabled on all public endpoints
- [ ] Health endpoint exposes minimal information
- [ ] DEEPSEEK_API_KEY never logged or exposed in errors
- [ ] PPRL enabled for sensitive data matching
- [ ] Docker images run as non-root user
- [ ] npm audit passed with zero critical/high vulnerabilities
