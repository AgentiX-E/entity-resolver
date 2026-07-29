/**
 * Request timeout middleware for Hono.
 *
 * Aborts requests that exceed a configurable timeout.
 * Returns HTTP 408 Request Timeout with a JSON error body.
 */
import type { Context, Next } from 'hono';

export interface TimeoutConfig {
  /** Timeout in milliseconds. Default: 30000 (30s) */
  durationMs?: number;
}

/**
 * Create a timeout middleware that aborts long-running requests.
 * Prevents server resources from being tied up indefinitely by
 * slow pipeline runs or hanging connections.
 */
export function createTimeoutMiddleware(config: TimeoutConfig = {}) {
  const durationMs = config.durationMs ?? 30_000;

  return async function timeoutMiddleware(c: Context, next: Next): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, durationMs);

    try {
      // Propagate abort signal through context
      c.req.raw.signal.addEventListener('abort', () => {
        controller.abort();
      });

      await next();

      // Check if the request was timed out
      if (controller.signal.aborted) {
        c.status(408);
        c.header('Content-Type', 'application/json');
        c.res = new Response(
          JSON.stringify({
            error: 'Request Timeout',
            message: `Request exceeded ${durationMs}ms timeout`,
            code: 'ER_TIMEOUT',
          }),
          { status: 408, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
