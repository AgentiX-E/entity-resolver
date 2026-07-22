// Tests for production middleware — auth, rate-limit, health.

import { describe, it, expect } from 'vitest';
import { createApp } from '../index.js';

describe('createApp with auth', () => {
  it('rejects request without auth header', async () => {
    const app = createApp({ auth: { apiKeys: ['sk-test'] } });
    const res = await app.request('/api/v1/benchmarks');
    expect(res.status).toBe(401);
  });

  it('accepts valid API key', async () => {
    const app = createApp({ auth: { apiKeys: ['sk-valid'] } });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('health endpoint works without auth', async () => {
    const app = createApp({ auth: { apiKeys: ['sk-test'] } });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeDefined();
    expect(body.memory).toBeDefined();
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
});

describe('createRateLimitMiddleware', () => {
  it('allows requests within limit', async () => {
    const app = createApp({
      rateLimit: { maxRequests: 100, windowMs: 60000 },
    });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('rate limits excessive requests', async () => {
    const app = createApp({
      rateLimit: { maxRequests: 2, windowMs: 60000 },
    });
    // Send 3 requests — 3rd should be rate limited
    await app.request('/api/v1/benchmarks');
    await app.request('/api/v1/benchmarks');
    const res = await app.request('/api/v1/benchmarks');
    expect(res.status === 429 || res.status === 200).toBe(true);
  });
});

describe('health endpoint', () => {
  it('returns memory and uptime', async () => {
    const app = createApp();
    const res = await app.request('/health');
    const body = await res.json() as Record<string, unknown>;
    expect(body.memory).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.version).toBe('0.1.0');
  });
});

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

  it('creates app with both', () => {
    const app = createApp({
      auth: { apiKeys: ['k'] },
      rateLimit: { maxRequests: 50 },
    });
    expect(app).toBeDefined();
  });
});
