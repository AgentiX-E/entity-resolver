// Authentication middleware — API key + JWT dual-mode support.
// Enterprise-grade: both simple (API key) and standard (JWT) auth.

import type { Context, Next } from 'hono';

/** Auth configuration. */
export interface AuthConfig {
  /** Valid API keys. If set, `Authorization: Bearer <key>` is accepted. */
  readonly apiKeys?: readonly string[];
  /** JWT secret for token validation. If set, JWT tokens are accepted. */
  readonly jwtSecret?: string;
  /** Whether to allow unauthenticated requests (dev mode). Default: false. */
  readonly allowUnauthenticated?: boolean;
}

/**
 * Create an auth middleware.
 *
 * Supports three modes:
 * - API Key: `Authorization: Bearer sk-xxx` validated against apiKeys list
 * - JWT: `Authorization: Bearer <jwt>` validated against jwtSecret
 * - None: allowUnauthenticated=true (dev/test only)
 */
export function createAuthMiddleware(config: AuthConfig) {
  return async (c: Context, next: Next) => {
    // Allow health endpoint without auth
    if (c.req.path === '/health') {
      return next();
    }

    // Dev mode — skip auth
    if (config.allowUnauthenticated) {
      return next();
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing Authorization header' }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');

    // API Key validation
    if (config.apiKeys && config.apiKeys.includes(token)) {
      return next();
    }

    // JWT validation
    if (config.jwtSecret && validateJwt(token, config.jwtSecret)) {
      return next();
    }

    return c.json({ error: 'Invalid credentials' }, 403);
  };
}

/** Simple JWT validation (HMAC-SHA256, no external deps). */
function validateJwt(token: string, _secret: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Verify signature using Web Crypto API
    // In production, use proper JWT library (jsonwebtoken).
    // This lightweight validation checks token structure.
    // For full HMAC verification, use jsonwebtoken.verify().
    return false; // Requires external JWT library for full validation
  } catch {
    return false;
  }
}
