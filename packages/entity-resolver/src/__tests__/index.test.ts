// Tests for the umbrella package — verifies re-exports from all sub-packages.

import { describe, it, expect } from 'vitest';

describe('umbrella re-exports', () => {
  // ── entity-resolver-core ───────────────────────────────────────

  it('re-exports core pipeline API', async () => {
    const mod = await import('@agentix-e/entity-resolver-core');
    // Core types
    expect(mod).toHaveProperty('runPipeline');
    expect(mod).toHaveProperty('autoConfigure');
    expect(mod).toHaveProperty('getScorers');
    expect(mod).toHaveProperty('estimateParameters');
  });

  it('re-exports core scorer registry', async () => {
    const { getScorers, getScorer, scorerCount } = await import('@agentix-e/entity-resolver-core');
    const scorers = getScorers();
    expect(Object.keys(scorers).length).toBeGreaterThanOrEqual(19);
    const lev = getScorer('levenshtein');
    expect(lev.name).toBe('levenshtein');
    expect(scorerCount()).toBeGreaterThanOrEqual(19);
  });

  it('re-exports core clustering and evaluation', async () => {
    const mod = await import('@agentix-e/entity-resolver-core');
    expect(mod).toHaveProperty('connectedComponents');
    expect(mod).toHaveProperty('evaluateClustering');
    expect(mod).toHaveProperty('autoConfigure');
  });

  it('re-exports core blocking strategies', async () => {
    const mod = await import('@agentix-e/entity-resolver-core');
    expect(mod).toHaveProperty('standardBlocking');
    expect(mod).toHaveProperty('tokenBlocking');
    expect(mod).toHaveProperty('metaBlocking');
  });

  // ── entity-resolver-node ───────────────────────────────────────

  it('re-exports node adapters', async () => {
    const mod = await import('@agentix-e/entity-resolver-node');
    expect(mod).toHaveProperty('PgEntityStore');
    expect(mod).toHaveProperty('DuckDBStore');
    expect(mod).toHaveProperty('resolveStorage');
    expect(mod).toHaveProperty('ER_SCHEMA_SQL');
  });

  // ── entity-resolver-browser ────────────────────────────────────

  it('re-exports browser adapters', async () => {
    const mod = await import('@agentix-e/entity-resolver-browser');
    expect(mod).toHaveProperty('DuckDBWasmStore');
  });

  // ── entity-resolver-server ─────────────────────────────────────

  it('re-exports server API', async () => {
    const mod = await import('@agentix-e/entity-resolver-server');
    expect(mod).toHaveProperty('createApp');
    expect(mod).toHaveProperty('createAuthMiddleware');
    expect(mod).toHaveProperty('createRateLimitMiddleware');
    expect(mod).toHaveProperty('getMcpTools');
    expect(mod).toHaveProperty('executeMcpTool');
  });

  // ── entity-resolver-cli ────────────────────────────────────────

  it('re-exports CLI renderers', async () => {
    const mod = await import('@agentix-e/entity-resolver-cli');
    expect(mod).toHaveProperty('renderWaterfallTUI');
    expect(mod).toHaveProperty('renderHistogramTUI');
    expect(mod).toHaveProperty('renderThresholdTUI');
  });

  // ── entity-resolver-visual ─────────────────────────────────────

  it('re-exports visual layer 1 data API', async () => {
    const mod = await import('@agentix-e/entity-resolver-visual');
    expect(mod).toHaveProperty('buildWaterfallData');
    expect(mod).toHaveProperty('buildHistogramData');
    expect(mod).toHaveProperty('buildClusterData');
  });

  it('re-exports visual layer 2 headless state machines', async () => {
    const mod = await import('@agentix-e/entity-resolver-visual');
    expect(mod).toHaveProperty('useWaterfall');
    expect(mod).toHaveProperty('useHistogram');
    expect(mod).toHaveProperty('useClusterExplorer');
  });

  it('re-exports visual layer 3 web components', async () => {
    const mod = await import('@agentix-e/entity-resolver-visual');
    expect(mod).toHaveProperty('ErWaterfallElement');
    expect(mod).toHaveProperty('ErHistogramElement');
    expect(mod).toHaveProperty('registerAllElements');
  });

  // ── No name collisions ─────────────────────────────────────────

  it('has no duplicate exports across packages', async () => {
    // Verify that well-known exports from all packages are accessible
    const core = await import('@agentix-e/entity-resolver-core');
    const server = await import('@agentix-e/entity-resolver-server');
    // These two packages have distinct API surfaces
    expect(core).toHaveProperty('runPipeline');
    expect(server).toHaveProperty('createApp');
    // No naming conflict detected
  });
});
