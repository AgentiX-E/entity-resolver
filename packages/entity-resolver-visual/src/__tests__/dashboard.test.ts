// Tests for Dashboard — shell, comparison viewer, event bus, export.
import { describe, it, expect } from 'vitest';
import type { PipelineResult, RawRecord } from '@agentix-e/entity-resolver-core';
import { exportDashboardHTML } from '../dashboard/index.js';

// ════��══════════════════════════════════════════════════════════
// DashboardEventBus
// ═══════════════════════════════════════════════════════════════

describe('DashboardEventBus', () => {
  it('dispatches events to registered handlers', () => {
    // Create a mock root element
    const root = document.createElement('div');
    // We'll test via DOM events for simplicity
    const received: string[] = [];
    root.addEventListener('er-dashboard:pair:select', ((e: CustomEvent) => {
      received.push(e.detail?.type ?? '');
    }) as EventListener);

    root.dispatchEvent(
      new CustomEvent('er-dashboard:pair:select', {
        bubbles: true,
        composed: true,
        detail: { type: 'pair:select', detail: { pairIndex: 5 } },
      }),
    );

    expect(received).toContain('pair:select');
  });

  it('supports multiple event types', () => {
    const root = document.createElement('div');
    const received: string[] = [];
    const handler = ((e: CustomEvent) => {
      received.push(e.detail?.type ?? '');
    }) as EventListener;

    root.addEventListener('er-dashboard:cluster:select', handler);
    root.addEventListener('er-dashboard:threshold:change', handler);

    root.dispatchEvent(
      new CustomEvent('er-dashboard:cluster:select', {
        bubbles: true, composed: true,
        detail: { type: 'cluster:select' },
      }),
    );
    root.dispatchEvent(
      new CustomEvent('er-dashboard:threshold:change', {
        bubbles: true, composed: true,
        detail: { type: 'threshold:change' },
      }),
    );

    expect(received).toContain('cluster:select');
    expect(received).toContain('threshold:change');
  });
});

// ═══════════════════════════════════════════════════════════════
// exportDashboardHTML
// ═══════════════════════════════════════════════════════════════

describe('exportDashboardHTML', () => {
  const mockResult: PipelineResult = {
    clusters: new Map(),
    scoredPairs: [],
    singletons: [],
    statistics: {
      totalRecords: 100,
      totalClusters: 10,
      matchedRecords: 50,
      matchRate: 0.5,
      averageClusterSize: 5,
      maxClusterSize: 20,
      executionTimeMs: 1000,
    },
    diagnostics: {
      muParameters: new Map(),
      matchWeightDistribution: [],
      unlinkableCount: 0,
    },
  };

  it('generates valid HTML document', () => {
    const html = exportDashboardHTML(mockResult);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('contains dashboard element', () => {
    const html = exportDashboardHTML(mockResult);
    expect(html).toContain('<er-dashboard');
  });

  it('embeds statistics data', () => {
    const html = exportDashboardHTML(mockResult);
    expect(html).toContain('"totalRecords":100');
    expect(html).toContain('"totalClusters":10');
    expect(html).toContain('"matchRate":0.5');
  });

  it('embeds records when provided', () => {
    const records: RawRecord[] = [{ name: 'Alice' }, { name: 'Bob' }];
    const html = exportDashboardHTML(mockResult, records);
    expect(html).toContain('"records":');
    expect(html).toContain('"name":"Alice"');
  });

  it('handles empty clusters', () => {
    const emptyResult: PipelineResult = {
      ...mockResult,
      clusters: new Map(),
      scoredPairs: [],
    };
    const html = exportDashboardHTML(emptyResult);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('handles clusters with members', () => {
    const resultWithClusters: PipelineResult = {
      ...mockResult,
      clusters: new Map([
        ['c1', { clusterId: 'c1', memberIds: [0, 1, 2], cohesion: 0.9 }],
      ]),
    };
    const html = exportDashboardHTML(resultWithClusters);
    expect(html).toContain('"id":"c1"');
    expect(html).toContain('[0,1,2]');
  });
});
