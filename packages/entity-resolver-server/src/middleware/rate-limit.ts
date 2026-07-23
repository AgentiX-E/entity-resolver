// Rate limiting middleware — token bucket algorithm.
// Memory-based implementation with configurable limits and TTL cleanup.

import type { Context, Next } from 'hono';

/** Rate limit configuration. */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window. Default: 100. */
  readonly maxRequests?: number;
  /** Time window in milliseconds. Default: 60000 (1 minute). */
  readonly windowMs?: number;
  /** Custom key generator (default: IP-based). */
  readonly keyGenerator?: (c: Context) => string;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/** Rate limiter handle returned by createRateLimitMiddleware. */
export interface RateLimiter {
  /** Hono middleware function. */
  readonly middleware: (c: Context, next: Next) => Promise<void>;
  /** Stop the automatic cleanup timer and clear all buckets. */
  readonly dispose: () => void;
}

/**
 * Create a rate limiting middleware using token bucket algorithm.
 *
 * Each client (identified by IP or custom key) gets a bucket
 * that refills at maxRequests/windowMs rate. Requests exceeding
 * the bucket return 429 Too Many Requests.
 *
 * Returns a {@link RateLimiter} with middleware and dispose functions.
 * Call `dispose()` during graceful shutdown to prevent memory leaks.
 */
export function createRateLimitMiddleware(config: RateLimitConfig = {}): RateLimiter {
  const maxRequests = config.maxRequests ?? 100;
  const windowMs = config.windowMs ?? 60000;
  const refillRate = maxRequests / windowMs;
  const buckets = new Map<string, Bucket>();
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  const middleware = async (c: Context, next: Next) => {
    // Skip rate limiting for health endpoint
    if (c.req.path === '/health') return next();

    const key = config.keyGenerator
      ? config.keyGenerator(c)
      : c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-IP') ?? 'anonymous';

    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: Date.now() };
      buckets.set(key, bucket);
    }

    // Refill tokens
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(maxRequests, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    // Check rate limit
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return next();
    }

    return c.json(
      {
        error: 'Too Many Requests',
        retryAfter: Math.ceil((1 - bucket.tokens) / refillRate / 1000),
      },
      429,
    );
  };

  // Start periodic TTL cleanup: evict buckets inactive for 2x the window
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const ttl = windowMs * 2;
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > ttl) {
        buckets.delete(key);
      }
    }
  }, Math.min(windowMs, 60000)); // Clean at most every 60s

  const dispose = () => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
    buckets.clear();
  };

  return { middleware, dispose };
}

/**
 * Starts bucket cleanup for rate limiters created with `createRateLimitMiddleware`.
 * @deprecated Use the `dispose()` method on the RateLimiter returned by
 *   `createRateLimitMiddleware()` instead. This function is a no-op
 *   and will be removed in a future version.
 */
export function startBucketCleanup(_intervalMs?: number): () => void {
  return () => {};
}
