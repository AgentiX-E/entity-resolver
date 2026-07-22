// REST API server for entity-resolution.
// Stateless by default — each request is an independent computation.
// Optional persistence via IEntityStore / IConfigStore adapters.

import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  runPipeline,
  autoConfigure,
  loadAllBenchmarks,
  runBenchmark,
} from '@agentix-e/entity-resolution-core';
import type { PipelineConfig } from '@agentix-e/entity-resolution-core';

/** Create the entity-resolution Hono app. */
export function createApp(): Hono {
  const app = new Hono();

  // Health check
  app.get('/health', (c: Context) => c.json({ status: 'ok', timestamp: Date.now() }));

  // Deduplicate records
  app.post('/api/v1/dedupe', async (c: Context) => {
    const body = await c.req.json<{
      records: Record<string, unknown>[];
      config?: Partial<PipelineConfig>;
    }>();
    if (!body.records?.length) return c.json({ error: 'No records provided' }, 400);

    const records = body.records;
    const config = body.config ? autoConfigure(records).config : autoConfigure(records).config;

    const result = await runPipeline(records, config);
    return c.json({
      clusters: Object.fromEntries(result.clusters),
      statistics: result.statistics,
      scoredPairs: result.scoredPairs.length,
    });
  });

  // Auto-configure endpoint
  app.post('/api/v1/autoconfigure', async (c: Context) => {
    const body = await c.req.json<{ records: Record<string, unknown>[] }>();
    if (!body.records?.length) return c.json({ error: 'No records provided' }, 400);

    const autoResult = autoConfigure(body.records);
    return c.json({
      config: autoResult.config,
      fields: autoResult.fields,
      confidence: autoResult.confidence,
      warnings: autoResult.warnings,
    });
  });

  // Diagnostics endpoints
  app.post('/api/v1/diagnostics/waterfall', async (c: Context) => {
    const body = await c.req.json<{ records: Record<string, unknown>[]; pairIndex?: number }>();
    if (!body.records?.length) return c.json({ error: 'No records provided' }, 400);
    const config = autoConfigure(body.records).config;
    const result = await runPipeline(body.records, config);
    return c.json({
      pairs: result.scoredPairs,
      totalPairs: result.scoredPairs.length,
      requestedIndex: body.pairIndex ?? 0,
    });
  });

  // Benchmark endpoint
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
    const body = await c.req.json<{ dataset?: string }>();
    const datasets = loadAllBenchmarks();
    const ds = body.dataset ? datasets.find((d) => d.name === body.dataset) : datasets[0];
    if (!ds) return c.json({ error: 'Dataset not found' }, 404);
    const result = await runBenchmark(ds);
    return c.json(result);
  });

  return app;
}
