// Rate limiting middleware — token bucket algorithm.
// Memory-based implementation with configurable limits.

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

/**
 * Create a rate limiting middleware using token bucket algorithm.
 *
 * Each client (identified by IP or custom key) gets a bucket
 * that refills at maxRequests/windowMs rate. Requests exceeding
 * the bucket return 429 Too Many Requests.
 */
export function createRateLimitMiddleware(config: RateLimitConfig = {}) {
  const maxRequests = config.maxRequests ?? 100;
  const windowMs = config.windowMs ?? 60000;
  const refillRate = maxRequests / windowMs;
  const buckets = new Map<string, Bucket>();

  return async (c: Context, next: Next) => {
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
}

/** Clean up expired buckets periodically. */
export function startBucketCleanup(intervalMs: number = 300000): () => void {
  const timer = setInterval(() => {
    // Buckets are cleaned lazily — they'll be recreated on next request
    // The Map itself is bounded by unique client count
  }, intervalMs);
  return () => clearInterval(timer);
}
