import { describe, it, expect } from 'vitest';
import { createApp, getMcpTools } from '../index.js';

describe('createApp', () => {
  it('creates a Hono app', () => {
    const app = createApp();
    expect(typeof app.fetch).toBe('function');
  });
});

describe('GET /health', () => {
  it('returns OK', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });
});

describe('POST /api/v1/dedupe', () => {
  it('returns 400 for empty records', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/dedupe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('deduplicates records', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/dedupe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ name: 'A' }, { name: 'B' }] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.statistics).toBeDefined();
  });
});

describe('POST /api/v1/autoconfigure', () => {
  it('returns config', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/autoconfigure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ email: 'a@b.com' }] }),
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/benchmarks', () => {
  it('lists 8 datasets', async () => {
    const app = createApp();
    const res = await app.request('/api/v1/benchmarks');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body.length).toBe(8);
  });
});

describe('getMcpTools', () => {
  it('returns 6 tools', () => {
    expect(getMcpTools().length).toBe(6);
  });

  it('includes er_dedupe', () => {
    const tools = getMcpTools();
    expect(tools.find((t) => t.name === 'er_dedupe')).toBeDefined();
  });
});
