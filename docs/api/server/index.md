# @agentix-e/entity-resolver-server

**Deployable HTTP/gRPC/MCP API service (stateless by default).**

## Installation

```bash
npm install @agentix-e/entity-resolver-server
```

## Key Modules

| Module | Description |
|--------|-------------|
| REST API | Hono-based REST endpoints (dedupe, match, health, entities) |
| Auth Middleware | Bearer token authentication |
| Rate Limiting | Configurable token bucket rate limiting |
| MCP Tools | Model Context Protocol tools for AI agent integration |

## Quick Example

```typescript
import { createApp } from '@agentix-e/entity-resolver-server';

const app = createApp({
  port: 3000,
  auth: { type: 'bearer', tokens: [process.env.API_TOKEN!] },
  rateLimit: { windowMs: 60_000, max: 100 },
});
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/dedupe` | Run deduplication pipeline |
| `POST` | `/api/match` | Match two records |
| `GET` | `/api/health` | Health check with uptime and memory |
| `GET` | `/api/entities/:id` | Retrieve entity by ID |

## Complete API Reference

→ [Full auto-generated API reference](/api/server/reference)
