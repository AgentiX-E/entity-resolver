/**
 * Typed error hierarchy for entity-resolver.
 *
 * Every throw in the codebase uses one of these classes instead of
 * `new Error(...)`. This enables:
 * - Programmatic error type discrimination (instanceof checks)
 * - Structured error codes for MCP/REST error responses
 * - JSON serialization/deserialization for transport
 * - Source-mapped stack traces for debugging
 */

/** Structured error context attached to every EntityResolverError. */
export interface ErrorContext {
  /** The operation that was in progress when the error occurred. */
  readonly operation?: string;
  /** Additional key-value diagnostic data. */
  readonly details?: Record<string, unknown>;
  /** The original cause, if this error wraps another. */
  readonly cause?: unknown;
}

/** Error code format: ER_{CATEGORY}_{CODE} */
export type ErrorCode = string;

// ══════════════════════════════════════════════════════════════
// Base class
// ══════════════════════════════════════════════════════════════

/**
 * Base error class for all entity-resolver errors.
 *
 * Every error has:
 * - code: machine-readable error code (ER_xxx)
 * - statusCode: suggested HTTP status code for API responses
 * - context: structured diagnostic information
 * - toJSON: safe serialization (no stack trace leak)
 */
export abstract class EntityResolverError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly context: ErrorContext;
  public readonly timestamp: string;

  constructor(message: string, code: ErrorCode, statusCode: number, context: ErrorContext = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Safe JSON serialization — omits stack trace. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

// ══════════════════════════════════════════════════════════════
// Error categories (10 tiers)
// ══════════════════════════════════════════════════════════════

/** Invalid input or configuration provided by the caller. */
export class ValidationError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_CONFIG_INVALID_INPUT', 400, context);
  }
}

/** Pipeline configuration is malformed or missing required fields. */
export class ConfigurationError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_CONFIG_MALFORMED', 400, context);
  }
}

/** External I/O failure (file, network, database). */
export class IOError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_IO_FAILURE', 500, context);
  }
}

/** Data parsing failure (CSV, JSON, etc. — structural, not semantic). */
export class ParseError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_PARSE_FAILURE', 400, context);
  }
}

/** Entity resolution failure during deduplication/matching/linking. */
export class ResolutionError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_RESOLVE_FAILURE', 500, context);
  }
}

/** Blocking stage failure (empty blocks, no candidates generated). */
export class BlockingError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_BLOCKING_FAILURE', 500, context);
  }
}

/** Scoring stage failure (unknown scorer, WASM crash, etc.). */
export class ScoringError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_SCORING_FAILURE', 500, context);
  }
}

/** Clustering stage failure (algorithm error, invalid graph state). */
export class ClusteringError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_CLUSTER_FAILURE', 500, context);
  }
}

/** Evaluation/benchmark stage failure. */
export class EvaluationError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_EVAL_FAILURE', 500, context);
  }
}

/** Fellegi-Sunter EM convergence failure. */
export class ConvergenceError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_EM_CONVERGENCE', 500, context);
  }
}

/** LLM/API integration failure. */
export class LLMError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_LLM_FAILURE', 502, context);
  }
}

/** Authentication/authorization failure. */
export class AuthError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_AUTH_FAILURE', 401, context);
  }
}

/** Rate limit exceeded. */
export class RateLimitError extends EntityResolverError {
  public readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number, context?: ErrorContext) {
    super(message, 'ER_RATE_LIMITED', 429, context);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Internal invariant violation (should never happen — indicates a bug). */
export class InternalError extends EntityResolverError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'ER_INTERNAL', 500, context);
  }
}

// ══════════════════════════════════════════════════════════════
// Error reconstruction from JSON (for MCP/network transport)
// ══════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErrorCtor = new (...args: any[]) => EntityResolverError;

const ERROR_CLASS_MAP = new Map<string, ErrorCtor>([
  ['ER_CONFIG_INVALID_INPUT', ValidationError],
  ['ER_CONFIG_MALFORMED', ConfigurationError],
  ['ER_IO_FAILURE', IOError],
  ['ER_PARSE_FAILURE', ParseError],
  ['ER_RESOLVE_FAILURE', ResolutionError],
  ['ER_BLOCKING_FAILURE', BlockingError],
  ['ER_SCORING_FAILURE', ScoringError],
  ['ER_CLUSTER_FAILURE', ClusteringError],
  ['ER_EVAL_FAILURE', EvaluationError],
  ['ER_EM_CONVERGENCE', ConvergenceError],
  ['ER_LLM_FAILURE', LLMError],
  ['ER_AUTH_FAILURE', AuthError],
  ['ER_RATE_LIMITED', RateLimitError],
  ['ER_INTERNAL', InternalError],
]);

/**
 * Reconstruct a typed error from its JSON representation.
 * Returns a plain Error if the code is unknown.
 */
export function reconstructError(json: Record<string, unknown>): EntityResolverError | Error {
  const code = json.code as string | undefined;
  const message = String(json.message ?? 'Unknown error');
  const context = (json.context as ErrorContext) ?? {};

  if (!code) {
    return new Error(message);
  }

  const Ctor = ERROR_CLASS_MAP.get(code);
  if (Ctor) {
    const err = Object.create(Ctor.prototype) as EntityResolverError;
    Object.assign(err, {
      message,
      code,
      statusCode: json.statusCode as number,
      context,
      timestamp: json.timestamp as string,
      name: Ctor.name,
    });
    return err;
  }

  return new Error(message);
}

/**
 * Wrap an unknown error into an EntityResolverError.
 * If it's already an EntityResolverError, return as-is.
 */
export function wrapError(
  err: unknown,
  fallbackMessage = 'An unexpected error occurred',
): EntityResolverError {
  if (err instanceof EntityResolverError) {
    return err;
  }
  if (err instanceof Error) {
    return new InternalError(fallbackMessage, {
      cause: err.message,
      details: { stack: err.stack },
    });
  }
  return new InternalError(fallbackMessage, { cause: String(err) });
}
