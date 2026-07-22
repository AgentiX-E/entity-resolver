// Layer 3: Themeable Web Components (Custom Elements v1).
// Framework-agnostic — works in React, Vue, Svelte, Angular, and vanilla HTML.
// Themed via CSS Custom Properties (--er-* variables).

import type {
  WaterfallChartData,
  HistogramData,
  MuChartData,
  ClusterExplorerData,
} from '../../data/api.js';

// ══════════════════════════════════════════════════════════════
// CSS Custom Properties theme defaults
// ══════════════════════════════════════════════════════════════

/** Default CSS custom properties for theming. Consumers override these. */
export const DEFAULT_THEME = {
  '--er-color-primary': '#1a73e8',
  '--er-color-match': '#34a853',
  '--er-color-nonmatch': '#ea4335',
  '--er-color-prior': '#9aa0a6',
  '--er-color-background': '#ffffff',
  '--er-color-text': '#202124',
  '--er-color-border': '#dadce0',
  '--er-font-family': 'system-ui, -apple-system, sans-serif',
  '--er-font-size-sm': '12px',
  '--er-font-size-md': '14px',
  '--er-font-size-lg': '18px',
  '--er-bar-height': '24px',
  '--er-bar-gap': '4px',
  '--er-border-radius': '4px',
  '--er-shadow': '0 1px 3px rgba(0,0,0,0.12)',
  '--er-transition': '200ms ease',
  '--er-max-width': '800px',
} as const;

/** Number of customizable theme variables. */
export const THEME_VARIABLE_COUNT = Object.keys(DEFAULT_THEME).length;

// ══════════════════════════════════════════════════════════════
// Web Component base class (for testability — real render via Shadow DOM)
// ══════════════════════════════════════════════════════════════

/**
 * Base class for entity-resolution web components.
 * Provides common Shadow DOM setup and attribute observation.
 */
export abstract class ErBaseElement extends HTMLElement {
  protected root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  /** Apply theme CSS custom properties to the shadow root. */
  protected applyTheme(): void {
    for (const [prop, value] of Object.entries(DEFAULT_THEME)) {
      (this.root.host as any)?.style?.setProperty(prop, value);
    }
  }

  /** Parse a JSON attribute value safely. */
  protected parseDataAttr<T>(attr: string | null): T | null {
    if (!attr || attr === 'undefined') return null;
    try {
      return JSON.parse(attr) as T;
    } catch {
      return null;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// <er-waterfall> — Waterfall Chart Component
// ══════════════════════════════════════════════════════════════

export class ErWaterfallElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: WaterfallChartData | null = null;

  connectedCallback(): void {
    this.applyTheme();
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<WaterfallChartData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.applyTheme();
      this.render();
    }
  }

  private render(): void {
    if (!this._data) {
      this.root.innerHTML =
        '<div style="padding:16px;color:var(--er-color-text)">No waterfall data loaded.</div>';
      return;
    }

    const bars = this._data.bars
      .map(
        (bar, _i) =>
          `<div style="display:flex;align-items:center;margin-bottom:var(--er-bar-gap);height:var(--er-bar-height)">
        <span style="width:120px;font-size:var(--er-font-size-sm)">${bar.label}</span>
        <div style="flex:1;background:${bar.weight >= 0 ? 'var(--er-color-match)' : 'var(--er-color-nonmatch)'};height:var(--er-bar-height);border-radius:var(--er-border-radius);min-width:${Math.max(1, Math.abs(bar.weight * 10))}px"></div>
        <span style="width:60px;text-align:right;font-size:var(--er-font-size-sm)">${bar.weight.toFixed(1)}</span>
      </div>`,
      )
      .join('');

    this.root.innerHTML = `
      <style>
        :host { display:block; max-width:var(--er-max-width); font-family:var(--er-font-family); }
      </style>
      <div style="padding:16px;background:var(--er-color-background);color:var(--er-color-text);border:1px solid var(--er-color-border);border-radius:var(--er-border-radius);box-shadow:var(--er-shadow)">
        <div style="font-size:var(--er-font-size-lg);margin-bottom:12px">Match Weight: ${this._data.totalWeight.toFixed(2)} (${(this._data.matchProbability * 100).toFixed(1)}%)</div>
        ${bars}
        <div style="margin-top:8px;font-size:var(--er-font-size-sm);color:var(--er-color-prior)">Pair: #${this._data.recordPair.idA} ↔ #${this._data.recordPair.idB}</div>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// <er-histogram> — Match Weight Histogram Component
// ══════════════════════════════════════════════════════════════

export class ErHistogramElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: HistogramData | null = null;

  connectedCallback(): void {
    this.applyTheme();
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<HistogramData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.applyTheme();
      this.render();
    }
  }

  private render(): void {
    if (!this._data) {
      this.root.innerHTML =
        '<div style="padding:16px;color:var(--er-color-text)">No histogram data loaded.</div>';
      return;
    }

    const maxCount = Math.max(...this._data.bins.map((b) => b.count), 1);
    const bars = this._data.bins
      .map(
        (bin) =>
          `<div style="display:flex;align-items:center;margin-bottom:var(--er-bar-gap)">
        <span style="width:80px;font-size:var(--er-font-size-sm)">[${bin.minWeight},${bin.maxWeight})</span>
        <div style="flex:1;background:var(--er-color-primary);height:var(--er-bar-height);border-radius:var(--er-border-radius);min-width:1px;width:${(bin.count / maxCount) * 100}%"></div>
        <span style="width:40px;text-align:right;font-size:var(--er-font-size-sm)">${bin.count}</span>
      </div>`,
      )
      .join('');

    this.root.innerHTML = `
      <style>:host { display:block; max-width:var(--er-max-width); font-family:var(--er-font-family); }</style>
      <div style="padding:16px;background:var(--er-color-background);color:var(--er-color-text);border:1px solid var(--er-color-border);border-radius:var(--er-border-radius);box-shadow:var(--er-shadow)">
        <div style="font-size:var(--er-font-size-lg);margin-bottom:12px">Match Weight Distribution</div>
        ${bars}
        <div style="margin-top:8px;font-size:var(--er-font-size-sm)">Total: ${this._data.summary.totalPairs} | Above threshold: ${this._data.summary.aboveThreshold} | Below: ${this._data.summary.belowThreshold}</div>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// <er-cluster-explorer> — Cluster Tree Component
// ══════════════════════════════════════════════════════════════

export class ErClusterExplorerElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: ClusterExplorerData | null = null;

  connectedCallback(): void {
    this.applyTheme();
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<ClusterExplorerData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.applyTheme();
      this.render();
    }
  }

  private render(): void {
    if (!this._data) {
      this.root.innerHTML =
        '<div style="padding:16px;color:var(--er-color-text)">No cluster data loaded.</div>';
      return;
    }

    const { totalClusters, totalRecords, singletonCount } = this._data;

    this.root.innerHTML = `
      <style>:host { display:block; max-width:var(--er-max-width); font-family:var(--er-font-family); }</style>
      <div style="padding:16px;background:var(--er-color-background);color:var(--er-color-text);border:1px solid var(--er-color-border);border-radius:var(--er-border-radius);box-shadow:var(--er-shadow)">
        <div style="font-size:var(--er-font-size-lg);margin-bottom:8px">Cluster Explorer</div>
        <div style="font-size:var(--er-font-size-sm);margin-bottom:12px">${totalClusters} clusters | ${totalRecords} records | ${singletonCount} singletons</div>
        <div style="font-size:var(--er-font-size-md);color:var(--er-color-primary)">Expand clusters to explore record composition</div>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// <er-mu-chart> — m/u Parameter Chart Component
// ══════════════════════════════════════════════════════════════

export class ErMuChartElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: MuChartData | null = null;

  connectedCallback(): void {
    this.applyTheme();
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<MuChartData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.applyTheme();
      this.render();
    }
  }

  private render(): void {
    if (!this._data) {
      this.root.innerHTML =
        '<div style="padding:16px;color:var(--er-color-text)">No parameter data loaded.</div>';
      return;
    }

    const rows = this._data.fields
      .flatMap((field) =>
        field.levels.map(
          (level) => `
          <tr style="font-size:var(--er-font-size-sm)">
            <td style="padding:4px 8px">${field.field}</td>
            <td style="padding:4px 8px">${level.label}</td>
            <td style="padding:4px 8px;color:var(--er-color-match)">${level.mProbability.toFixed(4)}</td>
            <td style="padding:4px 8px;color:var(--er-color-nonmatch)">${level.uProbability.toFixed(4)}</td>
            <td style="padding:4px 8px;font-weight:bold">${level.weight >= 0 ? '+' : ''}${level.weight.toFixed(2)}</td>
          </tr>`,
        ),
      )
      .join('');

    this.root.innerHTML = `
      <style>:host { display:block; max-width:var(--er-max-width); font-family:var(--er-font-family); overflow-x:auto; }</style>
      <div style="padding:16px;background:var(--er-color-background);color:var(--er-color-text);border:1px solid var(--er-color-border);border-radius:var(--er-border-radius);box-shadow:var(--er-shadow)">
        <div style="font-size:var(--er-font-size-lg);margin-bottom:12px">m/u Parameters (λ=${this._data.lambda.toExponential(2)})</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:2px solid var(--er-color-border)">
            <th style="text-align:left;padding:4px 8px">Field</th><th style="text-align:left;padding:4px 8px">Level</th>
            <th style="text-align:left;padding:4px 8px">m</th><th style="text-align:left;padding:4px 8px">u</th>
            <th style="text-align:left;padding:4px 8px">Weight</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}

/** Register all custom elements. Call once at app startup. */
export function registerAllElements(): void {
  customElements.define('er-waterfall', ErWaterfallElement);
  customElements.define('er-histogram', ErHistogramElement);
  customElements.define('er-cluster-explorer', ErClusterExplorerElement);
  customElements.define('er-mu-chart', ErMuChartElement);
}
