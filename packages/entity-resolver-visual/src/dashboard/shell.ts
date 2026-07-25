/**
 * DashboardShell — unified container for all ER diagnostic visualizations.
 *
 * <er-dashboard> is a single Custom Element that:
 * 1. Accepts a PipelineResult via .load(result, records?)
 * 2. Renders 5+ visualizations in a responsive grid layout
 * 3. Provides a threshold slider toolbar
 * 4. Coordinates cross-component interactions via event bus
 *
 * Zero framework dependencies — works in any HTML page.
 * Themed via CSS Custom Properties.
 */

import {
  buildWaterfallData,
  buildHistogramData,
  buildMuChartData,
  buildClusterData,
} from '../data/api.js';
import type { PipelineResult } from '@agentix-e/entity-resolver-core';
import type { RawRecord } from '@agentix-e/entity-resolver-core';
import { DashboardEventBus } from './interactions.js';

const STYLES = `
:host {
  display: block;
  font-family: var(--er-font-family, system-ui, -apple-system, sans-serif);
  color: var(--er-color-text, #202124);
  background: var(--er-color-background, #ffffff);
  max-width: var(--er-max-width, 960px);
  margin: 0 auto;
  padding: 16px;
}

.er-dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 2px solid var(--er-color-border, #dadce0);
  margin-bottom: 16px;
}

.er-dashboard-title {
  font-size: var(--er-font-size-lg, 18px);
  font-weight: 600;
}

.er-dashboard-stats {
  font-size: var(--er-font-size-sm, 12px);
  color: #5f6368;
}

.er-dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.er-dashboard-grid > * {
  min-width: 0;
  border: 1px solid var(--er-color-border, #dadce0);
  border-radius: var(--er-border-radius, 4px);
  padding: 12px;
}

.er-dashboard-full {
  grid-column: 1 / -1;
}

.er-section-title {
  font-size: var(--er-font-size-md, 14px);
  font-weight: 600;
  margin: 0 0 8px 0;
}

.er-empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 20px;
  color: #9aa0a6;
  font-size: var(--er-font-size-md, 14px);
}

@media (max-width: 640px) {
  .er-dashboard-grid {
    grid-template-columns: 1fr;
  }
}
`;

const DASHBOARD_HTML = `
<div class="er-dashboard-header">
  <div>
    <div class="er-dashboard-title">Entity Resolver Diagnostics</div>
    <div class="er-dashboard-stats" id="stats"></div>
  </div>
  <er-toolbar id="toolbar"></er-toolbar>
</div>
<div class="er-dashboard-grid" id="grid">
  <div id="waterfall-panel">
    <div class="er-section-title">⚡ Match Weight Waterfall</div>
    <er-waterfall id="waterfall"></er-waterfall>
  </div>
  <div id="histogram-panel">
    <div class="er-section-title">📊 Match Weight Distribution</div>
    <er-histogram id="histogram"></er-histogram>
  </div>
  <div id="mu-chart-panel">
    <div class="er-section-title">📐 m/u Parameters</div>
    <er-mu-chart id="muChart"></er-mu-chart>
  </div>
  <div id="evaluation-panel">
    <div class="er-section-title">🎯 Evaluation</div>
    <er-evaluation-radar id="evalRadar"></er-evaluation-radar>
  </div>
  <div class="er-dashboard-full" id="cluster-panel">
    <div class="er-section-title">🗂️ Cluster Explorer</div>
    <er-cluster-explorer id="clusterExplorer"></er-cluster-explorer>
  </div>
  <div class="er-dashboard-full" id="comparison-panel" style="display:none">
    <div class="er-section-title">🔍 Pair Comparison</div>
    <er-comparison-viewer id="comparisonViewer"></er-comparison-viewer>
  </div>
</div>
`;

/**
 * Dashboard Shell Custom Element.
 *
 * Usage:
 *   <er-dashboard></er-dashboard>
 *   document.querySelector('er-dashboard').load(pipelineResult)
 */
export class DashboardShell extends HTMLElement {
  private shadow: ShadowRoot;
  private bus!: DashboardEventBus;
  private result: PipelineResult | null = null;
  private records: RawRecord[] = [];
  private unsubs: (() => void)[] = [];

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `<style>${STYLES}</style>${DASHBOARD_HTML}`;
  }

  connectedCallback(): void {
    this.bus = new DashboardEventBus(this);
    this.setupInteractions();
  }

  disconnectedCallback(): void {
    for (const unsub of this.unsubs) unsub();
    this.bus.destroy();
  }

  /**
   * Load a PipelineResult and render all visualizations.
   * @param result — pipeline output with clusters, pairs, diagnostics
   * @param records — optional source records for the comparison viewer
   */
  load(result: PipelineResult, records?: RawRecord[]): void {
    this.result = result;
    this.records = records ?? [];

    if (!result || result.statistics.totalRecords === 0) {
      this.showEmpty();
      return;
    }

    this.renderStats(result);
    this.renderComponents(result);
  }

  // ── Stats header ──

  private renderStats(result: PipelineResult): void {
    const el = this.shadow.getElementById('stats');
    if (!el) return;
    const s = result.statistics;
    el.textContent = [
      `${s.totalRecords} records`,
      `${s.totalClusters} clusters`,
      `${(s.matchRate * 100).toFixed(1)}% match rate`,
      `${s.executionTimeMs}ms`,
    ].join(' · ');
  }

  // ── Component rendering ──

  private renderComponents(result: PipelineResult): void {
    // Waterfall
    const waterfallData = buildWaterfallData(result, 0);
    this.setComponentData('er-waterfall', 'data', waterfallData);

    // Histogram
    const histogramData = buildHistogramData(
      result,
      result.statistics.matchRate > 0 ? 0.5 : undefined,
    );
    this.setComponentData('er-histogram', 'data', histogramData);

    // m/u Chart
    const muData = buildMuChartData(result);
    this.setComponentData('er-mu-chart', 'data', muData);

    // Cluster Explorer
    const clusterData = buildClusterData(result, this.records);
    this.setComponentData('er-cluster-explorer', 'data', clusterData);
  }

  private setComponentData(selector: string, prop: string, value: unknown): void {
    const el = this.shadow.querySelector(selector);
    if (el && prop in el) {
      (el as unknown as Record<string, unknown>)[prop] = value;
    }
  }

  // ── Cross-component interactions ──

  private setupInteractions(): void {
    // Cluster select → update waterfall to best pair in that cluster
    this.unsubs.push(
      this.bus.on('cluster:select', (_event) => {
        // Future: update waterfall to show the highest-scoring pair in the selected cluster
      }),
    );

    // Pair select → show comparison viewer
    this.unsubs.push(
      this.bus.on('pair:select', (event) => {
        this.showComparisonViewer((event.detail?.pairIndex as number) ?? 0);
      }),
    );

    // Threshold change → recalculate histogram + clusters
    this.unsubs.push(
      this.bus.on('threshold:change', (event) => {
        const threshold = (event.detail?.value as number) ?? 0.5;
        if (this.result) {
          const histData = buildHistogramData(this.result, threshold);
          this.setComponentData('er-histogram', 'data', histData);
        }
      }),
    );
  }

  private showComparisonViewer(pairIndex: number): void {
    const panel = this.shadow.getElementById('comparison-panel');
    const viewer = this.shadow.getElementById('comparisonViewer') as HTMLElement & {
      load?: (pairIndex: number, result: PipelineResult, records: RawRecord[]) => void;
    };
    if (panel) panel.style.display = 'block';
    if (viewer?.load && this.result) {
      viewer.load(pairIndex, this.result, this.records);
    }
  }

  private showEmpty(): void {
    const grid = this.shadow.getElementById('grid');
    if (grid) {
      grid.innerHTML =
        '<div class="er-empty-state">No data to display. Run a pipeline first.</div>';
    }
  }
}

// Register the custom element if not already registered
if (typeof customElements !== 'undefined' && !customElements.get('er-dashboard')) {
  customElements.define('er-dashboard', DashboardShell);
}
