// Authentication middleware — API key + JWT dual-mode support.
// Enterprise-grade: both simple (API key) and standard (JWT) auth.
// Uses jose for real HMAC-SHA256 JWT verification via Web Crypto API.

import type { Context, Next } from 'hono';
import { jwtVerify, errors as joseErrors } from 'jose';

const { JWTExpired, JWTInvalid, JOSEError } = joseErrors;

/** Auth configuration. */
export interface AuthConfig {
  /** Valid API keys. If set, `Authorization: Bearer <key>` is accepted. */
  readonly apiKeys?: readonly string[];
  /** JWT secret for token validation. If set, JWT tokens are accepted. */
  readonly jwtSecret?: string;
  /** JWT algorithm to accept. Default: 'HS256'. */
  readonly jwtAlgorithm?: string;
  /** Expected JWT issuer claim. */
  readonly jwtIssuer?: string;
  /** Expected JWT audience claim. */
  readonly jwtAudience?: string;
  /** Whether to allow unauthenticated requests (dev mode). Default: false. */
  readonly allowUnauthenticated?: boolean;
}

/** Result of JWT validation. */
export interface JwtValidationResult {
  readonly valid: boolean;
  readonly payload?: Record<string, unknown>;
  readonly error?: string;
}

/**
 * Create an auth middleware.
 *
 * Supports three modes:
 * - API Key: `Authorization: Bearer sk-xxx` validated against apiKeys list
 * - JWT: `Authorization: Bearer <jwt>` validated against jwtSecret (HMAC-SHA256 via jose)
 * - None: allowUnauthenticated=true (dev/test only)
 *
 * API Key takes priority over JWT: if apiKeys is configured, API key is checked first.
 * If API key fails and jwtSecret is configured, falls through to JWT verification.
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

    const token = authHeader.replace(/^Bearer\s*/i, '');

    // Reject empty token after stripping Bearer prefix
    if (token.length === 0) {
      return c.json({ error: 'Missing Authorization header' }, 401);
    }

    // API Key validation (exact match, priority over JWT)
    if (config.apiKeys && config.apiKeys.includes(token)) {
      return next();
    }

    // JWT validation
    if (config.jwtSecret) {
      const result = await validateJwt(token, config);
      if (result.valid) {
        return next();
      }
      return c.json({ error: result.error ?? 'Invalid credentials' }, 403);
    }

    return c.json({ error: 'Invalid credentials' }, 403);
  };
}

/**
 * Validate a JWT token using jose with HMAC-SHA256.
 *
 * @returns Validation result with payload on success or error message on failure.
 */
async function validateJwt(
  token: string,
  config: Pick<AuthConfig, 'jwtSecret' | 'jwtAlgorithm' | 'jwtIssuer' | 'jwtAudience'>,
): Promise<JwtValidationResult> {
  try {
    const secret = new TextEncoder().encode(config.jwtSecret!);
    const algorithm = config.jwtAlgorithm ?? 'HS256';

    const verifyOptions: {
      algorithms: string[];
      issuer?: string;
      audience?: string;
    } = {
      algorithms: [algorithm],
    };

    if (config.jwtIssuer) {
      verifyOptions.issuer = config.jwtIssuer;
    }
    if (config.jwtAudience) {
      verifyOptions.audience = config.jwtAudience;
    }

    const { payload } = await jwtVerify(token, secret, verifyOptions);

    return {
      valid: true,
      payload: payload as Record<string, unknown>,
    };
  } catch (err) {
    if (err instanceof JWTExpired) {
      return { valid: false, error: 'Token expired' };
    }
    if (err instanceof JWTInvalid) {
      return { valid: false, error: 'Invalid credentials' };
    }
    if (err instanceof JOSEError) {
      return { valid: false, error: 'Invalid credentials' };
    }
    // Catch-all for unexpected errors
    return { valid: false, error: 'Invalid credentials' };
  }
}
