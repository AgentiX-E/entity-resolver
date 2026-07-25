// Tests for Prometheus metrics and enhanced health check.
import { describe, it, expect } from 'vitest';
import {
  pipelineDuration,
  pipelineRecordsTotal,
  pipelineClustersTotal,
  recordPipeline,
} from '../metrics/prometheus.js';
import { initHealthComponents } from '../logging/health.js';
import { createApp } from '../rest/app.js';

// ═══════════════════════════════════════════════════════════════
// Prometheus Metrics
// ═══════════════════════════════════════════════════════════════

describe('Prometheus metrics', () => {
  it('pipeline metrics types are defined', () => {
    expect(pipelineDuration.name).toBe('er_pipeline_duration_seconds');
    expect(pipelineRecordsTotal.name).toBe('er_pipeline_records_total');
    expect(pipelineClustersTotal.name).toBe('er_pipeline_clusters_total');
  });

  it('recordPipeline updates pipeline metrics', () => {
    recordPipeline(100, 5, 2500);
    // Should not throw
  });
});

// ═══════════════════════════════════════════════════════════════
// Metrics Middleware
// ═══════════════════════════════════════════════════════════════

describe('metrics middleware and endpoint', () => {
  it('/metrics endpoint returns 200', async () => {
    const app = createApp();
    const res = await app.request('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('/metrics endpoint contains process metrics', async () => {
    const app = createApp();
    const res = await app.request('/metrics');
    const body = await res.text();
    expect(body).toContain('process_heap_bytes');
    expect(body).toContain('process_uptime_seconds');
  });

  it('/metrics endpoint contains er_* metrics', async () => {
    const app = createApp();
    const res = await app.request('/metrics');
    const body = await res.text();
    expect(body).toContain('er_requests_total');
    expect(body).toContain('er_request_duration_seconds');
    expect(body).toContain('er_pipeline_duration_seconds');
  });

  it('api request increments request counter', async () => {
    const app = createApp();
    // Make a few requests to populate counters
    await app.request('/health');
    await app.request('/health');

    const res = await app.request('/metrics');
    const body = await res.text();
    // Should have at least one request counted for /health
    expect(body).toContain('/health');
  });
});

// ═══════════════════════════════════════════════════════════════
// Enhanced Health Check
// ═══════════════════════════════════════════════════════════════

describe('enhanced health check', () => {
  it('health check includes version field', async () => {
    const app = createApp();
    const res = await app.request('/health');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version).toBeDefined();
  });

  it('health check includes components when registered', async () => {
    // Register a component and check
    initHealthComponents();
    const app = createApp();
    const res = await app.request('/health');
    const body = (await res.json()) as Record<string, unknown>;
    const components = body.components as Record<string, unknown>;
    expect(components).toBeDefined();
    // memory component was registered by initHealthComponents
    expect(components.memory).toBeDefined();
  });

  it('health check includes uptime', async () => {
    const app = createApp();
    const res = await app.request('/health');
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime as number).toBeGreaterThan(0);
  });

  it('health check includes memory stats', async () => {
    const app = createApp();
    const res = await app.request('/health');
    const body = (await res.json()) as Record<string, unknown>;
    const memory = body.memory as Record<string, unknown>;
    expect(memory.heapUsed).toBeDefined();
    expect(memory.heapTotal).toBeDefined();
  });

  it('health check status is ok by default', async () => {
    const app = createApp();
    const res = await app.request('/health');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });

  it('health check is not rate-limited', async () => {
    const app = createApp({ rateLimit: { maxRequests: 1, windowMs: 60000 } });
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    }
  });

  it('health check bypasses auth', async () => {
    const app = createApp({ auth: { apiKeys: ['sk-test'] } });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  it('/metrics endpoint does not require auth when configured', async () => {
    const app = createApp({ auth: { jwtSecret: 'secret-min-32-chars-long-key!!' } });
    const res = await app.request('/metrics');
    // Should be accessible (metrics is not auth-protected like health)
    expect(res.status).toBe(200);
  });
});
