/**
 * Tests for W3C trace context propagation middleware.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { traceContextMiddleware, getTraceContext } from '../../middleware/trace.js';

describe('traceContextMiddleware', () => {
  // Helper: create an app with trace middleware that exposes trace context in response
  function createApp() {
    const app = new Hono();
    app.use('*', traceContextMiddleware());
    app.get('/test', (c: Context) => {
      const ctx = getTraceContext(c);
      return c.json({
        traceId: ctx?.traceId ?? 'none',
        spanId: ctx?.spanId ?? 'none',
        sampled: ctx?.sampled ?? false,
      });
    });
    return app;
  }

  it('W3C traceparent header parsed correctly (version-traceid-spanid-flags)', async () => {
    const app = createApp();

    const validTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const res = await app.request('/test', {
      headers: { traceparent: validTraceparent },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // trace-id should be propagated from the incoming header
    expect(body.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    // sampled should be true (flags = '01')
    expect(body.sampled).toBe(true);
  });

  it('W3C traceparent with flags=00 — sampled is false', async () => {
    const app = createApp();

    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00';
    const res = await app.request('/test', {
      headers: { traceparent },
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(body.sampled).toBe(false);
  });

  it('new trace-id and span-id generated when no header present', async () => {
    const app = createApp();

    const res = await app.request('/test');
    const body = (await res.json()) as Record<string, unknown>;

    // trace-id should be generated (not 'none')
    expect(body.traceId).not.toBe('none');
    expect(typeof body.traceId).toBe('string');
    expect(body.spanId).not.toBe('none');
    expect(typeof body.spanId).toBe('string');
    // New traces should be sampled by default
    expect(body.sampled).toBe(true);
  });

  it('trace-id is 32 hex characters', async () => {
    const app = createApp();

    // Test generated trace-id
    const res = await app.request('/test');
    const body = (await res.json()) as Record<string, unknown>;
    const traceId = body.traceId as string;

    expect(traceId).toHaveLength(32);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('span-id is 16 hex characters', async () => {
    const app = createApp();

    // Test generated span-id
    const res = await app.request('/test');
    const body = (await res.json()) as Record<string, unknown>;
    const spanId = body.spanId as string;

    expect(spanId).toHaveLength(16);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('span-id is also 16 hex chars when propagated', async () => {
    const app = createApp();

    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const res = await app.request('/test', {
      headers: { traceparent },
    });

    const body = (await res.json()) as Record<string, unknown>;
    const spanId = body.spanId as string;

    // New span-id for this service should be 16 hex chars
    expect(spanId).toHaveLength(16);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    // Should be different from original span-id (new span for this service)
    expect(spanId).not.toBe('00f067aa0ba902b7');
  });

  it('trace-id propagated to response header', async () => {
    const app = createApp();

    const traceparent = '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01';
    const res = await app.request('/test', {
      headers: { traceparent },
    });

    // Response should have the traceparent header
    const responseHeader = res.headers.get('traceparent');
    expect(responseHeader).toBeDefined();
    expect(responseHeader).toContain('abcdef1234567890abcdef1234567890');
    expect(responseHeader).toContain('-01'); // sampled flag
  });

  it('generated trace-id appears in response header', async () => {
    const app = createApp();

    const res = await app.request('/test');
    const responseHeader = res.headers.get('traceparent');

    expect(responseHeader).toBeDefined();
    const parts = responseHeader!.split('-');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('00'); // version
    expect(parts[1]).toHaveLength(32); // trace-id
    expect(parts[2]).toHaveLength(16); // span-id
  });

  it('missing traceparent version field — new trace generated', async () => {
    const app = createApp();

    // Version is not '00', so parsing returns null, generating new trace
    const invalidVersion = '01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const res = await app.request('/test', {
      headers: { traceparent: invalidVersion },
    });

    const body = (await res.json()) as Record<string, unknown>;
    // Should NOT propagate the trace-id from invalid header
    expect(body.traceId).not.toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(body.traceId).toHaveLength(32);
    // New generated trace
    expect(body.sampled).toBe(true);
  });

  it('invalid traceparent format (too short) — handled gracefully', async () => {
    const app = createApp();

    // Only 3 parts instead of 4
    const tooShort = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7';
    const res = await app.request('/test', {
      headers: { traceparent: tooShort },
    });

    const body = (await res.json()) as Record<string, unknown>;
    // Should have generated a new trace context
    expect(body.traceId).toHaveLength(32);
    expect(body.spanId).toHaveLength(16);
    expect(body.sampled).toBe(true);
  });

  it('invalid traceparent — wrong trace-id length', async () => {
    const app = createApp();

    const badTraceId = '00-too-short-00f067aa0ba902b7-01';
    const res = await app.request('/test', {
      headers: { traceparent: badTraceId },
    });

    const body = (await res.json()) as Record<string, unknown>;
    // New trace generated
    expect(body.traceId).toHaveLength(32);
    expect(body.sampled).toBe(true);
  });

  it('invalid traceparent — non-hex trace-id', async () => {
    const app = createApp();

    // Contains non-hex characters
    const nonHexTraceparent =
      '00-gggggggggggggggggggggggggggggggg-00f067aa0ba902b7-01';
    const res = await app.request('/test', {
      headers: { traceparent: nonHexTraceparent },
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.traceId).toHaveLength(32);
    expect(body.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('empty traceparent string — new trace generated', async () => {
    const app = createApp();

    // Empty string should be treated as absent header
    const res = await app.request('/test', {
      headers: { traceparent: '' },
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.traceId).toHaveLength(32);
    expect(body.spanId).toHaveLength(16);
    expect(body.sampled).toBe(true);
  });

  it('trace context survives middleware chain (multiple middlewares)', async () => {
    const app = new Hono();
    app.use('*', traceContextMiddleware());

    // Middleware that adds data after trace
    app.use('*', async (c: Context, next: Next) => {
      c.set('customData', 'layer1');
      await next();
    });

    app.get('/chain', (c: Context) => {
      const ctx = getTraceContext(c);
      const customData = c.get('customData');
      return c.json({
        hasTrace: ctx !== null,
        traceId: ctx?.traceId,
        spanId: ctx?.spanId,
        customData,
      });
    });

    const res = await app.request('/chain');
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.hasTrace).toBe(true);
    expect(body.traceId).toBeDefined();
    expect(body.spanId).toBeDefined();
    expect(body.customData).toBe('layer1');
  });

  it('multiple requests get independent trace contexts', async () => {
    const app = createApp();

    const res1 = await app.request('/test');
    const res2 = await app.request('/test');

    const body1 = (await res1.json()) as Record<string, unknown>;
    const body2 = (await res2.json()) as Record<string, unknown>;

    // Each request should have a different trace-id
    expect(body1.traceId).not.toBe(body2.traceId);
    // Each request should have a different span-id
    expect(body1.spanId).not.toBe(body2.spanId);
  });

  it('getTraceContext returns null when trace middleware not used', () => {
    const app = new Hono();
    app.get('/no-trace', (c: Context) => {
      const ctx = getTraceContext(c);
      return c.json({ hasTrace: ctx !== null });
    });

    // This is hard to test in isolation without full Hono test client,
    // so we verify the function works with an empty context
    // Create a minimal context-like object
    const fakeContext = {
      get: () => undefined,
    } as unknown as Context;

    const result = getTraceContext(fakeContext);
    expect(result).toBeNull();
  });

  it('valid traceparent with all lowercase hex works', async () => {
    const app = createApp();

    const traceparent = '00-abcdefabcdefabcdefabcdefabcdefab-1234567890abcdef-01';
    const res = await app.request('/test', {
      headers: { traceparent },
    });

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.traceId).toBe('abcdefabcdefabcdefabcdefabcdefab');
    expect(body.sampled).toBe(true);
  });

  it('valid traceparent with uppercase hex — rejected, new trace generated', async () => {
    const app = createApp();

    // Uppercase hex doesn't match the regex /^[0-9a-f]{32}$/ so parsing fails
    const traceparent = '00-ABCDEFABCDEFABCDEFABCDEFABCDEFAB-1234567890ABCDEF-01';
    const res = await app.request('/test', {
      headers: { traceparent },
    });

    const body = (await res.json()) as Record<string, unknown>;
    // A new trace is generated (not the uppercase one from the header)
    expect(body.traceId).not.toBe('ABCDEFABCDEFABCDEFABCDEFABCDEFAB');
    expect(body.traceId).toHaveLength(32);
    expect(body.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.sampled).toBe(true);
  });

  it('response traceparent header matches W3C format', async () => {
    const app = createApp();

    const res = await app.request('/test');
    const header = res.headers.get('traceparent');

    expect(header).toBeDefined();
    // Format: 00-{traceId}-{spanId}-{flags}
    const parts = header!.split('-');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('00');
    expect(parts[1]).toHaveLength(32);
    expect(parts[2]).toHaveLength(16);
    expect(['00', '01']).toContain(parts[3]);
  });
});
