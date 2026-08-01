# @agentix-e/entity-resolver-server

**Deployable HTTP/gRPC/MCP API** for entity-resolver. Stateless by default.

## Features

- **REST API** — deduplicate, match, link, gazetteer, benchmark
- **MCP JSON-RPC 2.0** — AI agent integration via Model Context Protocol
- **SSE transport** — server-sent events for MCP
- **Authentication** — JWT (HS256) + API keys
- **Rate limiting** — per-IP token bucket
- **Prometheus metrics** — `/metrics` endpoint (counters + histograms)
- **Health check** — `/health` with component status
- **Structured logging** — pino JSON logs
- **Security headers** — XSS, CSP, HSTS defaults

## Quick Start

```typescript
import { createApp } from '@agentix-e/entity-resolver-server';
const app = createApp({ auth: { apiKeys: ['sk-secret'] } });
// Deploy with any Node.js HTTP server
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |
| GET | `/dashboard` | Interactive diagnostics |
| POST | `/api/v1/dedupe` | Deduplicate records |
| POST | `/api/v1/autoconfigure` | Auto-detect fields |
| POST | `/api/v1/link` | Cross-dataset linkage |
| POST | `/api/v1/gazetteer` | Gazetteer matching |
| POST | `/api/v1/benchmarks/run` | Run benchmark |
| POST | `/api/v1/dashboard/data` | Dashboard data |

## License

MIT © Lambertyan
