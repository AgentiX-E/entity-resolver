# Production Deployment

This guide covers deploying `@agentix-e/entity-resolver-server` in production environments with best practices for security, monitoring, and reliability.

## 1. Docker — Single Container

The project includes a multi-stage Dockerfile at `docker/Dockerfile` that builds the server and produces a minimal production image.

### Build & Run

```bash
# Build the image
docker build -f docker/Dockerfile -t entity-resolver:latest .

# Run with default settings (in-memory mode)
docker run -d \
  --name entity-resolver \
  -p 3000:3000 \
  -e NODE_ENV=production \
  entity-resolver:latest
```

### Dockerfile Structure

```dockerfile
# Stage 1: Builder — compiles TypeScript with pnpm
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
COPY packages/ ./packages/
RUN pnpm --filter @agentix-e/entity-resolver-core build
RUN pnpm --filter @agentix-e/entity-resolver-node build
RUN pnpm --filter @agentix-e/entity-resolver-server build

# Stage 2: Runner — minimal production image
FROM node:22-alpine AS runner
RUN addgroup -S eruser && adduser -S eruser -G eruser
WORKDIR /app
COPY --from=builder /app/packages/entity-resolver-server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/entity-resolver-core/dist ./packages/entity-resolver-core/dist
COPY --from=builder /app/packages/entity-resolver-core/package.json ./packages/entity-resolver-core/package.json
ENV NODE_ENV=production
EXPOSE 3000
USER eruser
CMD ["node", "dist/index.js"]
```

Key security points:
- Runs as non-root `eruser`
- Uses `node:22-alpine` for minimal attack surface
- Multi-stage build excludes dev dependencies from final image
- No secrets in image layers

### Runtime Environment Variables

```bash
docker run -d \
  --name entity-resolver \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DEEPSEEK_API_KEY=sk-your-key \
  --memory="512m" \
  entity-resolver:latest
```

## 2. Docker Compose — With PostgreSQL

For production deployments that need persistent storage, use PostgreSQL as the backend.

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: erapp
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: entity_resolver
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U erapp -d entity_resolver']
      interval: 10s
      timeout: 5s
      retries: 5

  entity-resolver:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
      - DATABASE_URL=postgresql://erapp:${PG_PASSWORD}@postgres:5432/entity_resolver
      - API_KEY=${API_KEY:-}
      - JWT_SECRET=${JWT_SECRET:-}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'node', '-e', "const http=require('http');http.get('http://localhost:3000/health',r=>{process.exit(r.statusCode===200?0:1)})"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

volumes:
  pgdata:
```

### Environment File (.env)

```bash
# .env — never commit this file
PG_PASSWORD=your-secure-password-here
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
API_KEY=sk-er-prod-key-1234567890
JWT_SECRET=your-jwt-secret-at-least-32-chars
```

## 3. Kubernetes

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: entity-resolver
  labels:
    app: entity-resolver
spec:
  replicas: 3
  selector:
    matchLabels:
      app: entity-resolver
  template:
    metadata:
      labels:
        app: entity-resolver
    spec:
      containers:
        - name: server
          image: entity-resolver:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: er-secrets
                  key: database-url
            - name: DEEPSEEK_API_KEY
              valueFrom:
                secretKeyRef:
                  name: er-secrets
                  key: deepseek-api-key
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: er-secrets
                  key: api-key
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: entity-resolver
  labels:
    app: entity-resolver
spec:
  type: ClusterIP
  selector:
    app: entity-resolver
  ports:
    - port: 80
      targetPort: 3000
      protocol: TCP
      name: http
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: entity-resolver
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - er.yourdomain.com
      secretName: er-tls
  rules:
    - host: er.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: entity-resolver
                port:
                  number: 80
```

### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: er-secrets
type: Opaque
stringData:
  database-url: 'postgresql://erapp:password@postgres:5432/entity_resolver'
  deepseek-api-key: 'sk-your-key'
  api-key: 'sk-er-prod-key-1234567890'
```

## 4. PM2 / systemd — Bare-Metal

### PM2

```bash
# Install PM2
npm install -g pm2

# Start the server
cd /opt/entity-resolver
NODE_ENV=production pm2 start dist/index.js \
  --name entity-resolver \
  --instances max \
  --max-memory-restart 512M

# Persist across reboots
pm2 save
pm2 startup systemd
```

### systemd Unit File

```ini
# /etc/systemd/system/entity-resolver.service
[Unit]
Description=Entity Resolver API Server
After=network.target

[Service]
Type=simple
User=eruser
Group=eruser
WorkingDirectory=/opt/entity-resolver
Environment=NODE_ENV=production
EnvironmentFile=/opt/entity-resolver/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
LimitNOFILE=65535
MemoryHigh=450M
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now entity-resolver
sudo systemctl status entity-resolver
```

## 5. Monitoring — Prometheus + Grafana

### Metrics Endpoint

The server exposes Prometheus metrics at `GET /metrics` with zero external dependencies. Available metrics:

| Metric | Type | Labels |
|--------|------|--------|
| `er_requests_total` | Counter | method, route, status |
| `er_request_duration_seconds` | Histogram | method, route |
| `er_pipeline_duration_seconds` | Histogram | — |
| `er_pipeline_records_total` | Counter | — |
| `er_pipeline_clusters_total` | Counter | — |
| `process_heap_bytes` | Gauge | type (used/total) |
| `process_resident_memory_bytes` | Gauge | — |
| `process_cpu_seconds_total` | Counter | type (user/system) |
| `process_uptime_seconds` | Gauge | — |

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: entity-resolver
    scrape_interval: 15s
    static_configs:
      - targets: ['entity-resolver:3000']
    metrics_path: /metrics
```

### Grafana Dashboard JSON

Create a dashboard with the following panels:

1. **Request Rate** — `rate(er_requests_total[5m])` grouped by route
2. **P99 Duration** — `histogram_quantile(0.99, rate(er_request_duration_seconds_bucket[5m]))`
3. **Pipeline Throughput** — `rate(er_pipeline_records_total[5m])`
4. **Heap Usage %** — `process_heap_bytes{type="used"} / process_heap_bytes{type="total"} * 100`
5. **Uptime** — `process_uptime_seconds`

### Alerting Rules

```yaml
# alerts.yml
groups:
  - name: entity-resolver
    rules:
      - alert: HighErrorRate
        expr: rate(er_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: 'High error rate on entity-resolver'

      - alert: HighMemory
        expr: process_heap_bytes{type="used"} / process_heap_bytes{type="total"} > 0.9
        for: 5m
        annotations:
          summary: 'Entity Resolver memory usage above 90%'

      - alert: ServiceDown
        expr: up{job="entity-resolver"} == 0
        for: 2m
        annotations:
          summary: 'Entity Resolver service is down'
```

## 6. Health Checks

### Health Endpoint

`GET /health` — no authentication required. Returns:

```json
{
  "status": "ok",
  "uptime": 3600.5,
  "memory": {
    "rss": 104857600,
    "heapTotal": 83886080,
    "heapUsed": 52428800,
    "external": 2097152,
    "arrayBuffers": 1048576
  },
  "components": {
    "memory": { "status": "ok" },
    "uptime": { "status": "ok" }
  },
  "version": "0.0.0",
  "timestamp": "2025-07-15T10:30:00.000Z"
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `ok` | All components healthy |
| `degraded` | One or more components functioning but suboptimal (e.g., heap > 85%) |
| `unavailable` | Critical component failure (e.g., heap > 95%, database unreachable) |

### Readiness vs Liveness

- **Liveness probe** (`/health`): Use for kubernetes `livenessProbe`. Tells the orchestrator whether to restart the container. The status is never `unavailable` from memory alone.
- **Readiness probe** (`/health`): Use for kubernetes `readinessProbe`. Tells the load balancer whether the pod should receive traffic. More aggressive timing than liveness.

```yaml
# Example Kubernetes probe configuration
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 30
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 2
```

### Custom Health Components

```typescript
import { registerHealthComponent } from '@agentix-e/entity-resolver-server';

// Register a database connectivity check
registerHealthComponent('database', async () => {
  try {
    await db.query('SELECT 1');
    return { status: 'ok' };
  } catch {
    return { status: 'unavailable', message: 'Database connection failed' };
  }
});
```

## 7. Logging — Structured JSON

The server uses pino for structured JSON logging with automatic timestamps.

### Configuration

```bash
# Set log level via environment
LOG_LEVEL=info node dist/index.js   # default
LOG_LEVEL=debug node dist/index.js  # verbose
LOG_LEVEL=warn node dist/index.js   # production
LOG_LEVEL=silent node dist/index.js # no output
```

### Log Format

```json
{"level":30,"time":1721034600000,"pid":12345,"hostname":"server-01","name":"entity-resolver","msg":"Listening on http://localhost:3000"}
```

### Trace Context

Every request receives a W3C `traceparent` header for distributed tracing:

```bash
curl -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  http://localhost:3000/health
```

The `traceContextMiddleware` automatically propagates trace IDs through the pipeline for correlation across services.

### Production Log Setup

```bash
# Pipe to file with rotation
node dist/index.js | pino-pretty | tee -a /var/log/er/server.log

# Forward to ELK with logstash
node dist/index.js 2>&1 | tee -a /var/log/er/server.log | nc logstash 5000
```

## 8. Security

### mTLS Setup

For service-to-service communication, enable mutual TLS at the ingress/reverse proxy level:

```yaml
# nginx.conf
server {
    listen 443 ssl;
    server_name er.internal;

    ssl_certificate     /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_client_certificate /etc/nginx/certs/ca.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;

    location / {
        proxy_pass http://entity-resolver:3000;
    }
}
```

Generate certificates:

```bash
# Generate CA
openssl req -new -x509 -days 3650 -nodes -out ca.crt -keyout ca.key

# Generate server cert
openssl req -new -nodes -out server.csr -keyout server.key
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key -out server.crt

# Generate client cert
openssl req -new -nodes -out client.csr -keyout client.key
openssl x509 -req -days 365 -in client.csr -CA ca.crt -CAkey ca.key -out client.crt
```

### API Key Management

The server supports dual authentication: API keys and JWT.

```typescript
import { createApp } from '@agentix-e/entity-resolver-server';

const app = createApp({
  auth: {
    // Simple API key — constant-time comparison (prevents timing attacks)
    apiKeys: ['sk-er-prod-key-1234567890'],

    // JWT — HMAC-SHA256 with jose library
    jwtSecret: process.env.JWT_SECRET,
    jwtAlgorithm: 'HS256',
    jwtIssuer: 'er-auth-service',
    jwtAudience: 'er-api',
  },
});

export default app;
```

Client usage:

```bash
# API Key authentication
curl -H "Authorization: Bearer sk-er-prod-key-1234567890" \
  http://localhost:3000/api/v1/dedupe \
  -d '{"records": [...]}'

# JWT authentication
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  http://localhost:3000/api/v1/dedupe \
  -d '{"records": [...]}'
```

### Rate Limiting

Token bucket algorithm with configurable limits:

```typescript
const app = createApp({
  rateLimit: {
    maxRequests: 100,    // 100 requests per window
    windowMs: 60000,     // 1 minute window
    trustedProxies: ['10.0.0.1'], // Trust these proxies for X-Forwarded-For
  },
});
```

The `/health` and `/metrics` endpoints are exempt from rate limiting. Cleanup timers automatically evict stale buckets after 2x the window period.

## 9. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `NODE_ENV` | No | `development` | Set to `production` for optimized builds |
| `PORT` | No | `3000` | HTTP listen port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `LOG_LEVEL` | No | `info` | Pino log level (`debug`, `info`, `warn`, `error`, `silent`) |
| `DATABASE_URL` | No | — | PostgreSQL connection string. When set, enables PG backend. When empty, uses in-memory DuckDB. |
| `DEEPSEEK_API_KEY` | No | — | API key for LLM-assisted scoring and extraction |
| `API_KEY` | No | — | Server API key for client authentication |
| `JWT_SECRET` | No | — | Secret key for JWT token validation |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `JWT_ISSUER` | No | — | Expected JWT issuer claim |
| `JWT_AUDIENCE` | No | — | Expected JWT audience claim |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed CORS origins |
| `MAX_BODY_SIZE` | No | `10485760` | Maximum request body size in bytes (default: 10MB) |
| `RATE_MAX_REQUESTS` | No | `100` | Rate limit max requests |
| `RATE_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |

### Example Production .env

```bash
# .env — production configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=warn
DATABASE_URL=postgresql://erapp:${PG_PASSWORD}@pg-primary.internal:5432/entity_resolver
DEEPSEEK_API_KEY=sk-your-deepseek-prod-key
API_KEY=sk-er-prod-key-1234567890abc
JWT_SECRET=a-random-string-at-least-32-characters-long
JWT_ISSUER=er-auth-service
JWT_AUDIENCE=er-api
RATE_MAX_REQUESTS=200
RATE_WINDOW_MS=60000
```
