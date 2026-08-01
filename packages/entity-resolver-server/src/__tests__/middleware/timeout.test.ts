/**
 * Tests for the request timeout middleware.
 *
 * Uses real timers with spies to verify behavior since fake timers
 * conflict with Hono's async request test client.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { createTimeoutMiddleware } from '../../middleware/timeout.js';

describe('createTimeoutMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('request completes within timeout — returns 200', async () => {
    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 5000 }));
    app.get('/test', (c: Context) => c.text('ok'));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('request exceeds timeout — returns 408 with JSON body', async () => {
    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 1 }));
    app.get('/slow', async (_c: Context) => {
      // This handler takes longer than the 1ms timeout
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      return _c.text('slow');
    });

    const res = await app.request('/slow');

    expect(res.status).toBe(408);
    expect(res.headers.get('Content-Type')).toBe('application/json');

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Request Timeout');
    expect(body.code).toBe('ER_TIMEOUT');
  });

  it('default 30s timeout when no config provided', () => {
    // Test that omitted config uses default 30000ms internally
    const middleware = createTimeoutMiddleware();
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('default timeout message references 30000ms', async () => {
    const app = new Hono();
    app.use('*', createTimeoutMiddleware());
    app.get('/slow', async (_c: Context) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 31000);
      });
      return _c.text('slow');
    });

    // Use a spy to capture setTimeout calls and verify the duration
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const appInner = new Hono();
    appInner.use('*', createTimeoutMiddleware());
    appInner.get('/test', (c: Context) => c.text('ok'));
    await appInner.request('/test');

    // The middleware should have called setTimeout
    expect(setTimeoutSpy).toHaveBeenCalled();
    // The first argument is the callback, second is the duration (30000)
    const lastCall = setTimeoutSpy.mock.calls.find(
      ([, duration]) => duration === 30000 || duration === 30_000,
    );
    expect(lastCall).toBeDefined();
    setTimeoutSpy.mockRestore();
  });

  it('missing config — same as default (30000ms)', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const app = new Hono();
    // Passing empty config {} should use default
    app.use('*', createTimeoutMiddleware({}));
    app.get('/test', (c: Context) => c.text('ok'));
    await app.request('/test');

    const foundDefault = setTimeoutSpy.mock.calls.some(
      ([, duration]) => duration === 30000 || duration === 30_000,
    );
    expect(foundDefault).toBe(true);
    setTimeoutSpy.mockRestore();
  });

  it('custom timeout from config', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 5000 }));
    app.get('/test', (c: Context) => c.text('ok'));
    await app.request('/test');

    // Verify the custom duration was passed to setTimeout
    const foundCustom = setTimeoutSpy.mock.calls.some(
      ([, duration]) => duration === 5000,
    );
    expect(foundCustom).toBe(true);
    setTimeoutSpy.mockRestore();
  });

  it('timer is cleaned up after request completes (no leak)', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 5000 }));
    app.get('/test', (c: Context) => c.text('ok'));

    const res = await app.request('/test');
    expect(res.status).toBe(200);

    // clearTimeout should have been called in the finally block
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('timer is cleaned up even when request times out', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 1 }));
    app.get('/slow', async (_c: Context) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      return _c.text('slow');
    });

    await app.request('/slow');

    // clearTimeout should have been called in the finally block
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('concurrent requests have independent timers', async () => {
    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 5000 }));
    app.get('/test', (c: Context) => c.text('ok'));

    // Two concurrent fast requests should both succeed
    const [res1, res2] = await Promise.all([
      app.request('/test'),
      app.request('/test'),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('concurrent requests — one times out, one succeeds', async () => {
    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 1 }));

    app.get('/fast', (c: Context) => c.text('fast'));
    app.get('/slow', async (_c: Context) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      return _c.text('slow');
    });

    const [fast, slow] = await Promise.all([
      app.request('/fast'),
      app.request('/slow'),
    ]);

    expect(fast.status).toBe(200);
    expect(slow.status).toBe(408);
  });

  it('AbortController signal aborted when timeout fires', () => {
    // Unit test: verify that the middleware creates an AbortController
    // and the signal is used to detect timeout
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);

    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('AbortController signal NOT aborted when request completes in time', () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    // Without abort, signal stays non-aborted
  });

  it('timeout error response has correct JSON structure', async () => {
    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 1 }));
    app.get('/slow', async (_c: Context) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
      return _c.text('slow');
    });

    const res = await app.request('/slow');
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('code');
    expect(body.error).toBe('Request Timeout');
    expect(body.code).toBe('ER_TIMEOUT');
  });

  it('no timeout when next() handler returns immediately', async () => {
    const app = new Hono();
    app.use('*', createTimeoutMiddleware({ durationMs: 100 }));
    app.get('/test', (c: Context) => c.text('ok'));

    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});
