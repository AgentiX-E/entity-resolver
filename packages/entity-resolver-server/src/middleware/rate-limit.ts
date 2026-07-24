// Rate limiting middleware — token bucket algorithm.
// Memory-based implementation with configurable limits and TTL cleanup.

import type { Context, MiddlewareHandler } from 'hono';

/** Rate limit configuration. */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window. Default: 100. */
  readonly maxRequests?: number;
  /** Time window in milliseconds. Default: 60000 (1 minute). */
  readonly windowMs?: number;
  /** Custom key generator (default: IP-based with trusted proxy support). */
  readonly keyGenerator?: (c: Context) => string;
  /**
   * List of trusted proxy IPs or CIDR ranges.
   * When configured, only these proxies' X-Forwarded-For headers are trusted.
   * Without this, the X-Forwarded-For header is ignored and the direct
   * connection IP is used to prevent IP spoofing.
   * Default: empty (no proxies trusted — use direct connection IP).
   */
  readonly trustedProxies?: readonly string[];
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/** Rate limiter handle returned by createRateLimitMiddleware. */
export interface RateLimiter {
  /** Hono middleware function. */
  readonly middleware: MiddlewareHandler;
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

  const middleware: MiddlewareHandler = async (c, next) => {
    // Skip rate limiting for health endpoint
    if (c.req.path === '/health') {
      await next();
      return;
    }

    const key = config.keyGenerator
      ? config.keyGenerator(c)
      : resolveClientIp(c, config.trustedProxies);

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
      await next();
      return;
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
  cleanupTimer = setInterval(
    () => {
      const now = Date.now();
      const ttl = windowMs * 2;
      for (const [key, bucket] of buckets) {
        if (now - bucket.lastRefill > ttl) {
          buckets.delete(key);
        }
      }
    },
    Math.min(windowMs, 60000),
  ); // Clean at most every 60s

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
 * Resolve the client IP address safely.
 *
 * Without trusted proxies configured, uses only the direct connection IP
 * (from CF-Connecting-IP header or environment remoteAddr).
 * X-Forwarded-For is ignored entirely to prevent IP spoofing by untrusted clients.
 *
 * With trusted proxies configured, if the direct IP is in the trusted list,
 * the rightmost entry from X-Forwarded-For is used.
 */
function resolveClientIp(
  c: Context,
  trustedProxies?: readonly string[],
): string {
  // Get the actual connecting IP (not spoofable headers)
  const directIp =
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Real-IP') ??
    c.env?.remoteAddr ??
    'anonymous';

  if (!trustedProxies || trustedProxies.length === 0) {
    return directIp;
  }

  // Check if direct IP is a trusted proxy
  if (!trustedProxies.includes(directIp)) {
    return directIp;
  }

  // Direct IP is trusted — use X-Forwarded-For (rightmost entry)
  const xff = c.req.header('X-Forwarded-For');
  if (xff) {
    const ips = xff.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) {
      return ips[ips.length - 1]!;
    }
  }

  return directIp;
}

/**
 * @deprecated Use the `dispose()` method on the RateLimiter returned by
 *   `createRateLimitMiddleware()` instead. This function is a no-op
 *   and will be removed in a future version.
 */
export function startBucketCleanup(_intervalMs?: number): () => void {
  return () => {};
}
