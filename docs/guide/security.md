# Security Guide

## Dependency Audit

Run regularly to check for known vulnerabilities:

```bash
# Production-only audit
pnpm audit --prod

# Full audit (includes dev dependencies)
pnpm audit
```

All dependencies are pinned via `pnpm-lock.yaml`. Dependabot is configured in `.github/dependabot.yml` for automated updates.

**Note:** Dev dependency vulnerabilities (build tools, test frameworks) do not affect production deployments. The multi-stage Docker build excludes all dev dependencies from the final image. Production-only audit should report zero critical CVEs. If critical CVEs are found in production deps, update the affected package immediately.

## API Key Management

API keys are NEVER stored in code or committed to version control.

```typescript
// CORRECT: API key injected via configuration object
const result = await scoreWithLLM(pairs, records, {
  apiKey: process.env.DEEPSEEK_API_KEY, // Read from environment at runtime
  candidateLo: 0.3,
  candidateHi: 0.7,
});

// WRONG: Never hardcode API keys
// const result = await scoreWithLLM(pairs, records, {
//   apiKey: 'sk-xxxx', // DO NOT DO THIS
// });
```

Production deployment should use Kubernetes Secrets or a secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault).

## mTLS Configuration

For PostgreSQL connections with mutual TLS:

```typescript
import { readFileSync } from 'node:fs';

const backend = new PgSqlBackend({
  pool: {
    host: process.env.PG_HOST,
    port: 5432,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: {
      ca: readFileSync('/etc/ssl/certs/ca-cert.pem'),
      cert: readFileSync('/etc/ssl/certs/client-cert.pem'),
      key: readFileSync('/etc/ssl/private/client-key.pem'),
      rejectUnauthorized: true,
    },
  },
});
```

## Rate Limiting

The server includes configurable rate limiting middleware:

```typescript
// Default: 600 requests per minute per IP
// Configure via RATE_LIMIT_RPM environment variable
// Docker:    -e RATE_LIMIT_RPM=1200
// Kubernetes: RATE_LIMIT_RPM: "1200" in configmap.yaml
```

Rate-limited requests receive a `429 Too Many Requests` response with `Retry-After` header.

## Input Validation

All API endpoints validate input before processing:
- JSON body parsing with size limits (default: 10MB)
- Required field validation with descriptive 400 errors
- SQL injection prevention via parameterized queries (DuckDB/PostgreSQL)
- No raw SQL string construction from user input

## Error Message Sanitization

Production deployments (`NODE_ENV=production`) sanitize error responses:
- Stack traces are NOT included in API responses
- Error codes and brief descriptions are returned
- Full error details are logged server-side only
- `formatError` with `debug=true` is disabled in production

## Container Security

Docker images:
- Run as non-root user (`eruser`, UID 1000)
- All Linux capabilities dropped
- `runAsNonRoot: true` in Kubernetes security context
- Read-only root filesystem recommended for Kubernetes

## PPRL (Privacy-Preserving Record Linkage)

When using Bloom filter PPRL:
- Secret key must be shared securely between parties (not via API)
- Bloom filter parameters (size, hash count) affect privacy guarantees
- SHA-256 salted hashing provides cryptographic security
- DNS/URL-based PII must be normalized before encoding

## Security Checklist

- [ ] No API keys in source code
- [ ] `.env` files in `.gitignore`
- [ ] Dependencies audited (`pnpm audit`)
- [ ] Production uses `NODE_ENV=production`
- [ ] Rate limiting enabled in production
- [ ] mTLS configured for database connections
- [ ] Kubernetes secrets used (not configmaps) for credentials
- [ ] Docker images run as non-root
- [ ] Health check endpoint does not expose sensitive data
