import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createApp } from '../rest/app.js';

/**
 * Server REST API /api/v1/extract endpoints tests.
 */

function createTestApp(): Hono {
  return createApp({ debug: false });
}

describe('POST /api/v1/extract', () => {
  const app = createTestApp();

  it('extracts email from text', async () => {
    const res = await app.request('/api/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Contact user@example.com',
        fields: [{ name: 'email', type: 'email' }],
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.values).toBeDefined();
    expect((data.values as Record<string, unknown>).email).toBe('user@example.com');
  });

  it('extracts time from Chinese text', async () => {
    const res = await app.request('/api/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '下午3点开会',
        fields: [{ name: 'time', type: 'time' }, { name: 'title', type: 'string' }],
        intent: 'meeting',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    const values = data.values as Record<string, unknown>;
    expect(values.time).toBeDefined();
    expect(values.title).toBe('Meeting');
  });

  it('returns 400 for missing text field', async () => {
    const res = await app.request('/api/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: [{ name: 'email', type: 'email' }],
      }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing fields array', async () => {
    const res = await app.request('/api/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'hello',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('extracts multiple fields simultaneously', async () => {
    const res = await app.request('/api/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Contact user@example.com, price: $99.99',
        fields: [
          { name: 'email', type: 'email' },
          { name: 'price', type: 'number' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    const values = data.values as Record<string, unknown>;
    expect(values.email).toBe('user@example.com');
    expect(values.price).toBe(99.99);
  });

  it('includes provenance and confidence in response', async () => {
    const res = await app.request('/api/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'john@example.com',
        fields: [{ name: 'email', type: 'email' }],
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.provenance).toBeDefined();
    expect(data.confidence).toBeDefined();
    expect((data.provenance as Record<string, string>).email).toBe('pattern');
  });
});
