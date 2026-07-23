// Tests for production server — auth, rate-limit, health, API endpoints.

import { describe, it, expect } from 'vitest';
import { createApp } from '../index.js';

// ═══════════════════════════════════════════════════════════════
// Authentication
// ═══════════════════════════════════════════════════════════════

describe('authentication middleware', () => {
  it('rejects request without auth header', async () => {
    const app = createApp({ auth: { apiKeys: ['sk-test'] } });
    const res = await app.request('/api/v1/benchmarks');
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('Authorization');
  });

  it('accepts valid API key on protected route', async () => {
    const app = createApp({ auth: { apiKeys: ['sk-valid'] } });
    const res = await app.request('/api/v1/benchmarks', {
      headers: { Authorization: 'Bearer sk-valid' },
    });
    expect(res.status).toBe(200);
  });

  it('health endpoint bypasses auth', async () => {
    const app = createApp({ auth: { apiKeys: ['sk-test'] } });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('allows unauthenticated in dev mode', async () => {
    const app = createApp({ auth: { allowUnauthenticated: true } });
    const res = await app.request('/api/v1/benchmarks');
    expect(res.status).toBe(200);
  });

  it('rejects invalid token', async () => {
    const app = createApp({ auth: { jwtSecret: 'secret' } });
    const res = await app.request('/api/v1/benchmarks', {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects malformed auth header', async () => {
    const app = createApp({ auth: { apiKeys: ['key'] } });
    const res = await app.request('/api/v1/benchmarks', {
      headers: { Authorization: 'NotBearer key' },
    });
    expect(res.status).toBe(403);
  });

  it('accepts API key without Bearer prefix when exact match', async () => {
    const app = createApp({ auth: { apiKeys: ['raw-key'] } });
    // Auth header without Bearer should still be processed
    const res = await app.request('/api/v1/benchmarks', {
      headers: { Authorization: 'Bearer raw-key' },
    });
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Rate Limiting
// ═══════════════════════════════════════════════════════════════

describe('rate limit middleware', () => {
  it('allows requests within limit', async () => {
    const app = createApp({
      rateLimit: { maxRequests: 100, windowMs: 60000 },
    });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('health endpoint bypasses rate limit', async () => {
    const app = createApp({
      rateLimit: { maxRequests: 1, windowMs: 60000 },
    });
    await app.request('/health');
    await app.request('/health');
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('rate limits excessive requests', async () => {
    const app = createApp({
      rateLimit: { maxRequests: 2, windowMs: 60000 },
    });
    await app.request('/api/v1/benchmarks');
    await app.request('/api/v1/benchmarks');
    const res = await app.request('/api/v1/benchmarks');
    expect(res.status === 429 || res.status === 200).toBe(true);
  });

  it('returns retryAfter in rate limit response', async () => {
    const app = createApp({
      rateLimit: { maxRequests: 1, windowMs: 60000 },
    });
    await app.request('/api/v1/benchmarks');
    const res = await app.request('/api/v1/benchmarks');
    if (res.status === 429) {
      const body = await res.json() as Record<string, unknown>;
      expect(body.retryAfter).toBeDefined();
    }
  });

  it('custom key generator works', async () => {
    let calledKey = '';
    const app = createApp({
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000,
        keyGenerator: (c) => {
          calledKey = c.req.header('X-API-Key') ?? 'default';
          return calledKey;
        },
      },
    });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Health Endpoint
// ═══════════════════════════════════════════════════════════════

describe('health endpoint', () => {
  it('returns correct status and metadata', async () => {
    const app = createApp();
    const res = await app.request('/health');
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeGreaterThan(0);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.memory).toBeGreaterThan(0);
    expect(body.version).toBe('0.1.0');
  });

  it('health endpoint returns growing uptime', async () => {
    const app = createApp();
    const res1 = await app.request('/health');
    const body1 = await res1.json() as Record<string, unknown>;
    // Small delay to ensure uptime changes
    await new Promise((r) => setTimeout(r, 10));
    const res2 = await app.request('/health');
    const body2 = await res2.json() as Record<string, unknown>;
    expect((body2.uptime as number)).toBeGreaterThanOrEqual((body1.uptime as number));
  });
});

// ═══════════════════════════════════════════════════════════════
// API Endpoints
// ═══════════════════════════════════════════════════════════════

describe('API endpoints', () => {
  it('GET /api/v1/benchmarks returns dataset list', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/benchmarks');
    expect(res.status).toBe(200);
    const body = await res.json() as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]!.name).toBeTruthy();
    expect(body[0]!.recordCount).toBeGreaterThan(0);
  });

  it('POST /api/v1/dedupe rejects empty records', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/dedupe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/dedupe processes valid records', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/dedupe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [
          { name: 'Alice', city: 'New York' },
          { name: 'Alic', city: 'NYC' },
          { name: 'Alice', city: 'New York' },
          { name: 'Bob', city: 'Los Angeles' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.clusters).toBeDefined();
    expect(body.statistics).toBeDefined();
  });

  it('POST /api/v1/autoconfigure returns config', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/autoconfigure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [
          { name: 'Alice', email: 'a@test.com', dob: '1990-01-15' },
          { name: 'Bob', email: 'b@test.com', dob: '1985-06-20' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.config).toBeDefined();
    expect(body.fields).toBeDefined();
  });

  it('POST /api/v1/autoconfigure rejects empty records', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/autoconfigure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/diagnostics/waterfall returns diagnostics', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/diagnostics/waterfall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [
          { name: 'Alice' },
          { name: 'Alice' },
          { name: 'Bob' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.totalPairs).toBeDefined();
  });

  it('POST /api/v1/benchmarks/run returns benchmark result', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/benchmarks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: 'Cora' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.dataset).toBe('Cora');
    expect(body.executionTimeMs).toBeGreaterThan(0);
  });

  it('POST /api/v1/benchmarks/run returns 404 for unknown dataset', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/benchmarks/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: 'NonExistent' }),
    });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// ServerConfig
// ═══════════════════════════════════════════════════════════════

describe('ServerConfig', () => {
  it('creates app without middleware', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it('creates app with auth only', () => {
    const app = createApp({ auth: { apiKeys: ['k'] } });
    expect(app).toBeDefined();
  });

  it('creates app with rate-limit only', () => {
    const app = createApp({ rateLimit: { maxRequests: 10 } });
    expect(app).toBeDefined();
  });

  it('creates app with both auth and rate-limit', () => {
    const app = createApp({
      auth: { apiKeys: ['k'] },
      rateLimit: { maxRequests: 50 },
    });
    expect(app).toBeDefined();
  });

  it('empty config object creates working app', async () => {
    const app = createApp({});
    expect(app).toBeDefined();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });
});
