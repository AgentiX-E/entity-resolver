// REST API server for entity-resolver.
// Stateless by default — each request is an independent computation.
// Request validation via Zod schemas ensures type-safe input handling.
//
// Security-hardened with:
// - JSON parse error → 400 (not 500 with stack trace)
// - CORS headers with configurable origins
// - Request body size limit (default 10MB)
// - Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
// - Production mode: no stack traces in error responses

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  runPipeline,
  autoConfigure,
  loadAllBenchmarks,
  runBenchmark,
  gazetteerMatch,
  linkRecords,
} from '@agentix-e/entity-resolver-core';
import { getHealth } from '../logging/health.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.js';
import type { AuthConfig } from '../middleware/auth.js';
import type { RateLimitConfig } from '../middleware/rate-limit.js';
import { getMcpTools, executeMcpTool } from '../mcp/tools.js';

/** Server configuration. */
export interface ServerConfig {
  readonly auth?: AuthConfig;
  readonly rateLimit?: RateLimitConfig;
  /** Allowed CORS origins. Default: ['*'] (all origins). */
  readonly corsOrigins?: readonly string[];
  /** Maximum request body size in bytes. Default: 10MB. */
  readonly maxBodySize?: number;
  /** Whether to include stack traces in error responses. Default: false. */
  readonly debug?: boolean;
  /** Whether to skip security headers (not recommended). Default: false. */
  readonly skipSecurityHeaders?: boolean;
}

/** Default maximum request body size: 10MB */
const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024;

/** Graceful shutdown state. */
let _shuttingDown = false;
let _pendingRequests = 0;
const SHUTDOWN_TIMEOUT_MS = 15000;

/** Mark the server as shutting down. New requests will be rejected. */
export function initiateShutdown(): void {
  _shuttingDown = true;
}

/** Middleware: reject new requests during graceful shutdown. */
function shutdownGuardMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    if (_shuttingDown) {
      c.status(503);
      c.res = new Response(JSON.stringify({ error: 'Server is shutting down' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
      return;
    }
    await next();
  };
}

/** Middleware: track a request in-flight for graceful shutdown counting. */
function requestTrackingMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (_c: Context, next: Next) => {
    _pendingRequests++;
    try {
      await next();
    } finally {
      _pendingRequests--;
    }
  };
}

/**
 * Wait for pending requests to drain, then resolve.
 * Used by process.on('SIGTERM') handlers.
 */
export async function drainConnections(): Promise<void> {
  const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
  while (_pendingRequests > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ─── Zod schemas ──────────────────────────────────────────────────

const DedupeSchema = z
  .object({
    records: z.array(z.record(z.string(), z.unknown())).min(1, 'At least one record required'),
  })
  .strict();

const AutoconfigureSchema = z
  .object({
    records: z.array(z.record(z.string(), z.unknown())).min(1),
  })
  .strict();

const DiagnosticsSchema = z
  .object({
    records: z.array(z.record(z.string(), z.unknown())).min(1),
    pairIndex: z.number().int().min(0).optional(),
  })
  .strict();

const BenchmarkRunSchema = z
  .object({
    dataset: z.string().optional(),
  })
  .strict();

const GazetteerSchema = z
  .object({
    queryRecords: z.array(z.record(z.string(), z.unknown())).min(1),
    indexRecords: z.array(z.record(z.string(), z.unknown())).min(1),
    threshold: z.number().min(0).max(1).optional(),
  })
  .strict();

const LinkSchema = z
  .object({
    left: z.array(z.record(z.string(), z.unknown())).min(1),
    right: z.array(z.record(z.string(), z.unknown())).min(1),
    threshold: z.number().min(0).max(1).optional(),
  })
  .strict();

const McpExecuteSchema = z
  .object({
    tool: z.string().min(1),
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// ─── Security helpers ─────────────────────────────────────────────

/**
 * Format an error for API response. In production (debug=false),
 * stack traces and internal messages are stripped.
 */
function formatError(err: unknown, debug: boolean): { error: string; detail?: string } {
  if (debug && err instanceof Error) {
    const result: { error: string; detail?: string } = { error: err.message };
    if (err.stack) result.detail = err.stack;
    return result;
  }
  if (err instanceof Error) {
    return { error: err.message };
  }
  return { error: 'Internal server error' };
}

/** Add security headers to every response. */
function securityHeadersMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('X-XSS-Protection', '1; mode=block');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  };
}

// ─── Validation helper ───────────────────────────────────────────

function parseAndRespond(c: Context, schema: z.ZodSchema, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    return c.json(
      {
        error: 'Validation failed',
        details: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      400,
    );
  }
  return null; // valid
}

// ─── JSON parse error handler ─────────────────────────────────────

/**
 * Safe JSON parse wrapper. On parse failure, returns a 400 response
 * instead of letting the default Hono handler return 500 with stack trace.
 */
async function safeJson<T = unknown>(c: Context): Promise<T | Response> {
  try {
    return await c.req.json<T>();
  } catch {
    // SAFE: intentional graceful degradation — return 400 on malformed JSON
    // instead of letting default handler leak a 500 with stack trace
    return c.json({ error: 'Invalid JSON in request body' }, 400);
  }
}

// ─── App factory ──────────────────────────────────────────────────

/** Create the entity-resolver Hono app with production security middleware. */
export function createApp(config: ServerConfig = {}): Hono {
  const app = new Hono();
  const debug = config.debug ?? false;

  // ── Security middleware (outermost layer) ──

  // CORS
  const corsOrigins = config.corsOrigins ?? ['*'];
  app.use(
    '*',
    cors({
      origin: corsOrigins as unknown as string[],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    }),
  );

  // Body size limit
  app.use('*', bodyLimit({ maxSize: config.maxBodySize ?? DEFAULT_MAX_BODY_SIZE }));

  // Security headers
  if (!config.skipSecurityHeaders) {
    app.use('*', securityHeadersMiddleware());
  }

  // Authentication
  if (config.auth) {
    app.use('*', createAuthMiddleware(config.auth));
  }

  // Rate limiting
  if (config.rateLimit) {
    app.use('*', createRateLimitMiddleware(config.rateLimit).middleware);
  }

  // Graceful shutdown guard
  app.use('*', shutdownGuardMiddleware());

  // Request tracking for graceful drain
  app.use('*', requestTrackingMiddleware());

  // ── Routes ──

  // Health check (no auth required — bypassed in auth middleware)
  app.get('/health', (c: Context) => c.json(getHealth()));

  // Deduplicate records
  app.post('/api/v1/dedupe', async (c: Context) => {
    const body = await safeJson(c);
    if (body instanceof Response) return body;

    const err = parseAndRespond(c, DedupeSchema, body);
    if (err) return err;

    const { records } = body as z.infer<typeof DedupeSchema>;
    try {
      const auto = autoConfigure(records);
      const result = await runPipeline(records, auto.config);
      return c.json({
        clusters: Object.fromEntries(result.clusters),
        statistics: result.statistics,
        scoredPairs: result.scoredPairs.length,
      });
    } catch (err) {
      return c.json(formatError(err, debug), 500);
    }
  });

  // Auto-configure
  app.post('/api/v1/autoconfigure', async (c: Context) => {
    const body = await safeJson(c);
    if (body instanceof Response) return body;

    const err = parseAndRespond(c, AutoconfigureSchema, body);
    if (err) return err;

    const { records } = body as z.infer<typeof AutoconfigureSchema>;
    const autoResult = autoConfigure(records);
    return c.json({
      config: autoResult.config,
      fields: autoResult.fields,
      confidence: autoResult.confidence,
      warnings: autoResult.warnings,
    });
  });

  // Diagnostics
  app.post('/api/v1/diagnostics/waterfall', async (c: Context) => {
    const body = await safeJson(c);
    if (body instanceof Response) return body;

    const err = parseAndRespond(c, DiagnosticsSchema, body);
    if (err) return err;

    const { records } = body as z.infer<typeof DiagnosticsSchema>;
    try {
      const config = autoConfigure(records).config;
      const result = await runPipeline(records, config);
      return c.json({
        pairs: result.scoredPairs,
        totalPairs: result.scoredPairs.length,
      });
    } catch (err) {
      return c.json({ pairs: [], totalPairs: 0, error: formatError(err, debug).error }, 200);
    }
  });

  // Gazetteer matching
  app.post('/api/v1/gazetteer', async (c: Context) => {
    const body = await safeJson(c);
    if (body instanceof Response) return body;

    const err = parseAndRespond(c, GazetteerSchema, body);
    if (err) return err;

    const { queryRecords, indexRecords, threshold } = body as z.infer<typeof GazetteerSchema>;
    try {
      const auto = autoConfigure([...queryRecords, ...indexRecords]);
      const result = await gazetteerMatch(queryRecords, indexRecords, {
        comparisons: auto.config.comparisons,
        matchThreshold: threshold ?? 0.5,
      });
      return c.json({
        matches: result.queryToIndexMatches.map((p) => ({
          queryIndex: p.leftId,
          indexIndex: p.rightId - queryRecords.length,
          score: p.score,
        })),
        totalMatches: result.queryToIndexMatches.length,
      });
    } catch (err) {
      return c.json(formatError(err, debug), 500);
    }
  });

  // Record linking
  app.post('/api/v1/link', async (c: Context) => {
    const body = await safeJson(c);
    if (body instanceof Response) return body;

    const err = parseAndRespond(c, LinkSchema, body);
    if (err) return err;

    const { left, right, threshold } = body as z.infer<typeof LinkSchema>;
    try {
      const auto = autoConfigure([...left, ...right]);
      const result = await linkRecords(left, right, {
        comparisons: auto.config.comparisons,
        matchThreshold: threshold ?? 0.5,
      });
      return c.json({
        crossPairs: result.crossPairs,
        totalPairs: result.crossPairs.length,
        statistics: result.statistics,
      });
    } catch (err) {
      return c.json(formatError(err, debug), 500);
    }
  });

  // Benchmark endpoints
  app.get('/api/v1/benchmarks', async (c: Context) => {
    const datasets = loadAllBenchmarks();
    return c.json(
      datasets.map((d) => ({
        name: d.name,
        recordCount: d.recordCount,
        trueMatchCount: d.trueMatchCount,
      })),
    );
  });

  app.post('/api/v1/benchmarks/run', async (c: Context) => {
    const body = await safeJson(c);
    if (body instanceof Response) return body;

    const err = parseAndRespond(c, BenchmarkRunSchema, body);
    if (err) return err;

    const { dataset } = body as z.infer<typeof BenchmarkRunSchema>;
    const datasets = loadAllBenchmarks();
    const ds = dataset ? datasets.find((d) => d.name === dataset) : datasets[0];
    if (!ds) return c.json({ error: 'Dataset not found' }, 404);
    const result = await runBenchmark(ds);
    return c.json(result);
  });

  // MCP tools
  app.get('/api/v1/mcp/tools', (c: Context) => {
    return c.json({ tools: getMcpTools() });
  });

  app.post('/api/v1/mcp/execute', async (c: Context) => {
    const body = await safeJson(c);
    if (body instanceof Response) return body;

    const err = parseAndRespond(c, McpExecuteSchema, body);
    if (err) return err;

    const { tool, params } = body as z.infer<typeof McpExecuteSchema>;
    try {
      const result = await executeMcpTool(tool, params ?? {});
      return c.json(result);
    } catch (err) {
      return c.json(formatError(err, debug), 500);
    }
  });

  return app;
}
