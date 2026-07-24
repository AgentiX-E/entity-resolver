/**
 * Comprehensive tests for the EntityResolverError hierarchy.
 */
import { describe, it, expect } from 'vitest';
import {
  EntityResolverError,
  ValidationError,
  ConfigurationError,
  IOError,
  ParseError,
  ResolutionError,
  BlockingError,
  ScoringError,
  ClusteringError,
  EvaluationError,
  ConvergenceError,
  LLMError,
  AuthError,
  RateLimitError,
  InternalError,
  reconstructError,
  wrapError,
} from '../../errors/hierarchy.js';

/** Factory type: create error from message + optional context */
type ErrorFactory = (msg: string, context?: Record<string, unknown>) => EntityResolverError;

const ERROR_SPECS: Array<{
  name: string;
  factory: ErrorFactory;
  expectedCode: string;
  expectedStatus: number;
}> = [
  { name: 'ValidationError', factory: (m, c) => new ValidationError(m, c ? { details: c } : undefined), expectedCode: 'ER_CONFIG_INVALID_INPUT', expectedStatus: 400 },
  { name: 'ConfigurationError', factory: (m, c) => new ConfigurationError(m, c ? { details: c } : undefined), expectedCode: 'ER_CONFIG_MALFORMED', expectedStatus: 400 },
  { name: 'IOError', factory: (m, c) => new IOError(m, c ? { details: c } : undefined), expectedCode: 'ER_IO_FAILURE', expectedStatus: 500 },
  { name: 'ParseError', factory: (m, c) => new ParseError(m, c ? { details: c } : undefined), expectedCode: 'ER_PARSE_FAILURE', expectedStatus: 400 },
  { name: 'ResolutionError', factory: (m, c) => new ResolutionError(m, c ? { details: c } : undefined), expectedCode: 'ER_RESOLVE_FAILURE', expectedStatus: 500 },
  { name: 'BlockingError', factory: (m, c) => new BlockingError(m, c ? { details: c } : undefined), expectedCode: 'ER_BLOCKING_FAILURE', expectedStatus: 500 },
  { name: 'ScoringError', factory: (m, c) => new ScoringError(m, c ? { details: c } : undefined), expectedCode: 'ER_SCORING_FAILURE', expectedStatus: 500 },
  { name: 'ClusteringError', factory: (m, c) => new ClusteringError(m, c ? { details: c } : undefined), expectedCode: 'ER_CLUSTER_FAILURE', expectedStatus: 500 },
  { name: 'EvaluationError', factory: (m, c) => new EvaluationError(m, c ? { details: c } : undefined), expectedCode: 'ER_EVAL_FAILURE', expectedStatus: 500 },
  { name: 'ConvergenceError', factory: (m, c) => new ConvergenceError(m, c ? { details: c } : undefined), expectedCode: 'ER_EM_CONVERGENCE', expectedStatus: 500 },
  { name: 'LLMError', factory: (m, c) => new LLMError(m, c ? { details: c } : undefined), expectedCode: 'ER_LLM_FAILURE', expectedStatus: 502 },
  { name: 'AuthError', factory: (m, c) => new AuthError(m, c ? { details: c } : undefined), expectedCode: 'ER_AUTH_FAILURE', expectedStatus: 401 },
  { name: 'InternalError', factory: (m, c) => new InternalError(m, c ? { details: c } : undefined), expectedCode: 'ER_INTERNAL', expectedStatus: 500 },
];

// ══════════════════════════════════════════════════════════════
// Error class construction
// ══════════════════════════════════════════════════════════════

describe('EntityResolverError hierarchy', () => {
  for (const { name, factory, expectedCode, expectedStatus } of ERROR_SPECS) {
    describe(name, () => {
      it('constructs and satisfies instanceof checks', () => {
        const err = factory('test message');
        expect(err).toBeInstanceOf(EntityResolverError);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('test message');
        expect(err.code).toBe(expectedCode);
        expect(err.statusCode).toBe(expectedStatus);
        expect(err.timestamp).toBeTruthy();
      });

      it('constructs with context', () => {
        const err = factory('test', { key: 'value' });
        expect(err.context.details).toEqual({ key: 'value' });
      });
    });
  }

  it('RateLimitError stores retryAfterSeconds', () => {
    const err = new RateLimitError('rate limited', 30);
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.code).toBe('ER_RATE_LIMITED');
    expect(err.statusCode).toBe(429);
  });

  it('flat hierarchy: child classes are not instanceof siblings', () => {
    const config = new ConfigurationError('msg');
    expect(config).not.toBeInstanceOf(ValidationError);
  });
});

// ══════════════════════════════════════════════════════════════
// Serialization
// ══════════════════════════════════════════════════════════════

describe('serialization', () => {
  it('toJSON excludes stack trace', () => {
    const err = new ConfigurationError('bad config', {
      operation: 'test',
      details: { key: 'val' },
    });
    const json = err.toJSON();
    expect(json).toHaveProperty('name');
    expect(json).toHaveProperty('code');
    expect(json).toHaveProperty('message');
    expect(json).toHaveProperty('statusCode');
    expect(json).toHaveProperty('context');
    expect(json).toHaveProperty('timestamp');
    expect(json).not.toHaveProperty('stack');
  });

  it('JSON.stringify uses toJSON', () => {
    const err = new ValidationError('bad input');
    const str = JSON.stringify(err);
    const parsed = JSON.parse(str);
    expect(parsed.code).toBe('ER_CONFIG_INVALID_INPUT');
    expect(parsed.stack).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// reconstructError
// ══════════════════════════════════════════════════════════════

describe('reconstructError', () => {
  it('reconstructs typed error from JSON', () => {
    const original = new IOError('disk full', {
      operation: 'write',
      details: { disk: '/dev/sda' },
    });
    const reconstructed = reconstructError(original.toJSON());
    expect(reconstructed).toBeInstanceOf(EntityResolverError);
    expect(reconstructed.message).toBe('disk full');
  });

  it('returns plain Error for unknown code', () => {
    const result = reconstructError({ code: 'ER_UNKNOWN', message: 'x' });
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(EntityResolverError);
  });

  it('returns plain Error for missing code', () => {
    const result = reconstructError({ message: 'no code' });
    expect(result).toBeInstanceOf(Error);
  });
});

// ══════════════════════════════════════════════════════════════
// wrapError
// ══════════════════════════════════════════════════════════════

describe('wrapError', () => {
  it('returns EntityResolverError as-is', () => {
    const original = new IOError('original');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('wraps standard Error into InternalError', () => {
    const original = new Error('something broke');
    const wrapped = wrapError(original, 'custom fallback');
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.message).toBe('custom fallback');
  });

  it('wraps non-Error values into InternalError', () => {
    const wrapped = wrapError('a string error', 'custom msg');
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.message).toBe('custom msg');
  });
});

// ══════════════════════════════════════════════════════════════
// Error code uniqueness and format
// ══════════════════════════════════════════════════════════════

describe('error codes', () => {
  it('all error codes are unique', () => {
    const codes = ERROR_SPECS.map((e) => e.factory('msg').code);
    codes.push(new RateLimitError('msg', 1).code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('all error codes follow ER_ pattern', () => {
    for (const spec of ERROR_SPECS) {
      expect(spec.factory('msg').code).toMatch(/^ER_[A-Z_]+$/);
    }
  });
});
