// REST API server for entity-resolution.
// Stateless by default — each request is an independent computation.
// Request validation via Zod schemas ensures type-safe input handling.

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  runPipeline, autoConfigure, loadAllBenchmarks, runBenchmark,
  gazetteerMatch, linkRecords,
} from '@agentix-e/entity-resolution-core';
import type { PipelineConfig, GazetteerConfig, RecordLinkConfig } from '@agentix-e/entity-resolution-core';
import { createAuthMiddleware } from '../middleware/auth.js';
import { createRateLimitMiddleware } from '../middleware/rate-limit.js';
import type { AuthConfig } from '../middleware/auth.js';
import type { RateLimitConfig } from '../middleware/rate-limit.js';
import { getMcpTools, executeMcpTool } from '../mcp/tools.js';

/** Server configuration. */
export interface ServerConfig {
  readonly auth?: AuthConfig;
  readonly rateLimit?: RateLimitConfig;
}

// ─── Zod schemas ──────────────────────────────────────────────────

const DedupeSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())).min(1, 'At least one record required'),
}).strict();

const AutoconfigureSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())).min(1),
}).strict();

const DiagnosticsSchema = z.object({
  records: z.array(z.record(z.string(), z.unknown())).min(1),
  pairIndex: z.number().int().min(0).optional(),
}).strict();

const BenchmarkRunSchema = z.object({
  dataset: z.string().optional(),
}).strict();

const GazetteerSchema = z.object({
  queryRecords: z.array(z.record(z.string(), z.unknown())).min(1),
  indexRecords: z.array(z.record(z.string(), z.unknown())).min(1),
  threshold: z.number().min(0).max(1).optional(),
}).strict();

const LinkSchema = z.object({
  left: z.array(z.record(z.string(), z.unknown())).min(1),
  right: z.array(z.record(z.string(), z.unknown())).min(1),
  threshold: z.number().min(0).max(1).optional(),
}).strict();

const McpExecuteSchema = z.object({
  tool: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict();

// ─── Helper ───────────────────────────────────────────────────────

function parseAndRespond(c: Context, schema: z.ZodSchema, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    return c.json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }, 400);
  }
  return null; // valid
}

/** Create the entity-resolution Hono app with production middleware. */
export function createApp(config: ServerConfig = {}): Hono {
  const app = new Hono();

  // Production middleware
  if (config.auth) {
    app.use('*', createAuthMiddleware(config.auth));
  }
  if (config.rateLimit) {
    app.use('*', createRateLimitMiddleware(config.rateLimit));
  }

  // Enhanced health check
  app.get('/health', (c: Context) => c.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage().heapUsed,
    version: '0.1.0',
  }));

  // Deduplicate records
  app.post('/api/v1/dedupe', async (c: Context) => {
    const body = await c.req.json();
    const err = parseAndRespond(c, DedupeSchema, body);
    if (err) return err;

    const { records } = body as z.infer<typeof DedupeSchema>;
    try {
      const auto = autoConfigure(records);
      const result = await runPipeline(records, auto.config as PipelineConfig);
      return c.json({
        clusters: Object.fromEntries(result.clusters),
        statistics: result.statistics,
        scoredPairs: result.scoredPairs.length,
      });
    } catch (err) {
      return c.json({ error: `Pipeline failed: ${String(err)}` }, 500);
    }
  });

  // Auto-configure endpoint
  app.post('/api/v1/autoconfigure', async (c: Context) => {
    const body = await c.req.json();
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

  // Diagnostics waterfall
  app.post('/api/v1/diagnostics/waterfall', async (c: Context) => {
    const body = await c.req.json();
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
      return c.json({ pairs: [], totalPairs: 0, error: String(err) }, 200);
    }
  });

  // Gazetteer matching
  app.post('/api/v1/gazetteer', async (c: Context) => {
    const body = await c.req.json();
    const err = parseAndRespond(c, GazetteerSchema, body);
    if (err) return err;

    const { queryRecords, indexRecords, threshold } = body as z.infer<typeof GazetteerSchema>;
    try {
      const auto = autoConfigure([...queryRecords, ...indexRecords]);
      const result = await gazetteerMatch(queryRecords, indexRecords, {
        comparisons: auto.config.comparisons,
        matchThreshold: threshold ?? 0.5,
      } as GazetteerConfig);
      return c.json({
        matches: result.queryToIndexMatches.map((p) => ({
          queryIndex: p.leftId,
          indexIndex: p.rightId - queryRecords.length,
          score: p.score,
        })),
        totalMatches: result.queryToIndexMatches.length,
      });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // Record linking
  app.post('/api/v1/link', async (c: Context) => {
    const body = await c.req.json();
    const err = parseAndRespond(c, LinkSchema, body);
    if (err) return err;

    const { left, right, threshold } = body as z.infer<typeof LinkSchema>;
    try {
      const auto = autoConfigure([...left, ...right]);
      const result = await linkRecords(left, right, {
        comparisons: auto.config.comparisons,
        matchThreshold: threshold ?? 0.5,
      } as RecordLinkConfig);
      return c.json({
        crossPairs: result.crossPairs,
        totalPairs: result.crossPairs.length,
        statistics: result.statistics,
      });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
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
    const body = await c.req.json();
    const err = parseAndRespond(c, BenchmarkRunSchema, body);
    if (err) return err;

    const { dataset } = body as z.infer<typeof BenchmarkRunSchema>;
    const datasets = loadAllBenchmarks();
    const ds = dataset ? datasets.find((d) => d.name === dataset) : datasets[0];
    if (!ds) return c.json({ error: 'Dataset not found' }, 404);
    const result = await runBenchmark(ds);
    return c.json(result);
  });

  // MCP tools listing
  app.get('/api/v1/mcp/tools', (c: Context) => {
    return c.json({ tools: getMcpTools() });
  });

  // MCP tool execution
  app.post('/api/v1/mcp/execute', async (c: Context) => {
    const body = await c.req.json();
    const err = parseAndRespond(c, McpExecuteSchema, body);
    if (err) return err;

    const { tool, params } = body as z.infer<typeof McpExecuteSchema>;
    try {
      const result = await executeMcpTool(tool, params ?? {});
      return c.json(result);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return app;
}
