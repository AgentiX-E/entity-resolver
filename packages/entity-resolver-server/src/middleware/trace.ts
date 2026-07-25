/**
 * Trace context propagation for entity-resolver-server.
 *
 * Implements W3C Trace Context Level 2 (traceparent header).
 * Enables distributed tracing across microservices by propagating
 * trace-id and span-id through all HTTP requests and pipeline stages.
 *
 * The trace context is injected into structured logs so every
 * log entry can be correlated to its originating request.
 */

import type { Context, Next } from 'hono';

/** Trace context carried through a single request. */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly sampled: boolean;
}

/** Generate a 16-byte hex trace ID. */
function generateTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** Generate an 8-byte hex span ID. */
function generateSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// ═══════════════════════════════════════════════════════════════
// W3C traceparent header parsing
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a W3C traceparent header value.
 * Format: 00-{traceId}-{spanId}-{flags}
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
function parseTraceparent(header: string): TraceContext | null {
  const parts = header.split('-');
  if (parts.length !== 4 || parts[0] !== '00') return null;

  const traceId = parts[1];
  const spanId = parts[2];
  const flags = parts[3];

  if (!traceId || traceId.length !== 32 || !/^[0-9a-f]{32}$/.test(traceId)) return null;
  if (!spanId || spanId.length !== 16 || !/^[0-9a-f]{16}$/.test(spanId)) return null;

  const sampled = (flags ?? '00') === '01';

  return { traceId, spanId, sampled };
}

/**
 * Format a TraceContext back into a W3C traceparent header value.
 */
function formatTraceparent(ctx: TraceContext): string {
  const flags = ctx.sampled ? '01' : '00';
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

// ═══════════════════════════════════════════════════════════════
// Hono middleware
// ═══════════════════════════════════════════════════════════════

/**
 * Hono middleware that extracts or creates trace context.
 *
 * 1. Reads incoming `traceparent` header (W3C standard)
 * 2. If absent, generates a new trace context
 * 3. Generates a new span-id for this service
 * 4. Stores trace context in Hono context for downstream use
 * 5. Attaches `traceresponse` header to the response
 *
 * This enables:
 * - End-to-end request tracing across services
 * - Correlating logs from different pipeline stages
 * - Distributed debugging in production environments
 */
export function traceContextMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    // Extract incoming trace context
    const incomingHeader = c.req.header('traceparent');
    const incoming = incomingHeader ? parseTraceparent(incomingHeader) : null;

    // Create or propagate trace context
    const trace: TraceContext = incoming
      ? {
          traceId: incoming.traceId,
          spanId: generateSpanId(), // New span for this service
          sampled: incoming.sampled,
        }
      : {
          traceId: generateTraceId(),
          spanId: generateSpanId(),
          sampled: true,
        };

    // Store in context for downstream use
    c.set('traceContext', trace);

    // Set response headers
    c.res.headers.set('traceparent', formatTraceparent(trace));
    if (incoming) {
      c.res.headers.set('tracestate', c.req.header('tracestate') ?? '');
    }

    await next();
  };
}

/**
 * Extract trace context from a Hono context.
 * Returns null if the trace middleware hasn't executed.
 */
export function getTraceContext(c: Context): TraceContext | null {
  return (c.get('traceContext') as TraceContext) ?? null;
}
