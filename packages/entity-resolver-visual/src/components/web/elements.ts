// Layer 3: Themeable Web Components (Custom Elements v1).
// Framework-agnostic — works in React, Vue, Svelte, Angular, and vanilla HTML.
// Themed via CSS Custom Properties (--er-* variables) applied in :host Shadow DOM.
//
// SECURITY: No innerHTML with unsanitized data. All dynamic values go through
// escapeHtml() or safe DOM construction. XSS payload injection is tested
// automatically via the test suite.

import type {
  WaterfallChartData,
  HistogramData,
  MuChartData,
  ClusterExplorerData,
  ClusterTreeNode,
} from '../../data/api.js';

// ══════════════════════════════════════════════════════════════
// HTML Sanitization
// ══════════════════════════════════════════════════════════════

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

/**
 * Escape a string for safe insertion into HTML text content or attribute values.
 * Prevents XSS by encoding the five critical characters.
 */
export function escapeHtml(value: string | number | boolean): string {
  const s = String(value);
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

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
// Shared safe DOM helpers
// ══════════════════════════════════════════════════════════════

/**
 * Create a <style> element with the given CSS text. Used in Shadow DOM
 * to avoid innerHTML injection vectors.
 */
function createStyleElement(css: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = css;
  return style;
}

/**
 * Create a <div> with inline styles. Returns the element so callers can
 * further customize or append children via safe DOM APIs.
 */
function createDiv(
  styles: string,
  ...children: (string | Node)[]
): HTMLDivElement {
  const div = document.createElement('div');
  div.setAttribute('style', styles);
  for (const child of children) {
    if (typeof child === 'string') {
      div.appendChild(document.createTextNode(child));
    } else {
      div.appendChild(child);
    }
  }
  return div;
}

/**
 * Create a <span> with inline styles and text content (automatically escaped).
 */
function createSpan(styles: string, text: string | number): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('style', styles);
  span.textContent = String(text);
  return span;
}

/**
 * Empty the shadow root and append a style element plus content.
 */
function resetShadowRoot(
  root: ShadowRoot,
  css: string,
  ...children: Node[]
): void {
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }
  root.appendChild(createStyleElement(css));
  for (const child of children) {
    root.appendChild(child);
  }
}

// ══════════════════════════════════════════════════════════════
// Web Component base class
// ══════════════════════════════════════════════════════════════

/**
 * Base class for entity-resolver web components.
 * Provides common Shadow DOM setup and attribute observation.
 *
 * Theme variables are applied via a <style> block inside the Shadow DOM
 * using :host selectors, rather than polluting the host element's inline styles.
 */
export abstract class ErBaseElement extends HTMLElement {
  protected root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  /** Build a <style> element with :host theme variables for the Shadow DOM. */
  protected buildThemeStyle(): HTMLStyleElement {
    const vars = Object.entries(DEFAULT_THEME)
      .map(([prop, value]) => `${prop}: ${value};`)
      .join('\n      ');
    return createStyleElement(`:host {\n      ${vars}\n    }`);
  }

  /** Parse a JSON attribute value safely. */
  protected parseDataAttr<T>(attr: string | null): T | null {
    if (!attr || attr === 'undefined') return null;
    try {
      return JSON.parse(attr) as T;
    } catch {
      // SAFE: intentional graceful degradation — return null on malformed
      // JSON attribute data so the component renders its empty state
      return null;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Base element CSS (shared by all components)
// ══════════════════════════════════════════════════════════════

const BASE_HOST_CSS = `:host {
  display: block;
  max-width: var(--er-max-width);
  font-family: var(--er-font-family);
}`;

const CARD_CSS = `padding: 16px;
background: var(--er-color-background);
color: var(--er-color-text);
border: 1px solid var(--er-color-border);
border-radius: var(--er-border-radius);
box-shadow: var(--er-shadow);`;

function buildFullCss(extra: string = ''): string {
  return `${BASE_HOST_CSS}\n${extra}`;
}

// ══════════════════════════════════════════════════════════════
// <er-waterfall> — Waterfall Chart Component
// ══════════════════════════════════════════════════════════════

export class ErWaterfallElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: WaterfallChartData | null = null;

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<WaterfallChartData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.render();
    }
  }

  private render(): void {
    if (!this._data) {
      resetShadowRoot(
        this.root,
        buildFullCss(),
        createDiv('padding: 16px;', 'No waterfall data loaded.'),
      );
      return;
    }

    const card = createDiv(CARD_CSS);
    const themeStyle = this.buildThemeStyle();

    // Title row
    const title = createDiv(
      `font-size: var(--er-font-size-lg); margin-bottom: 12px;`,
      `Match Weight: ${escapeHtml(this._data.totalWeight.toFixed(2))} (${escapeHtml((this._data.matchProbability * 100).toFixed(1))}%)`,
    );
    card.appendChild(title);

    // Bars
    for (const bar of this._data.bars) {
      const row = createDiv(
        `display: flex; align-items: center; margin-bottom: var(--er-bar-gap); height: var(--er-bar-height);`,
      );
      row.appendChild(
        createSpan(
          'width: 120px; font-size: var(--er-font-size-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
          escapeHtml(bar.label),
        ),
      );

      const barColor =
        bar.weight >= 0
          ? 'var(--er-color-match)'
          : 'var(--er-color-nonmatch)';
      const barWidth = Math.max(1, Math.abs(bar.weight * 10));
      const barDiv = createDiv(
        `flex: 1; background: ${barColor}; height: var(--er-bar-height); border-radius: var(--er-border-radius); min-width: ${barWidth}px;`,
      );
      // Set width proportionally
      barDiv.style.width = `${barWidth}px`;
      row.appendChild(barDiv);

      row.appendChild(
        createSpan(
          'width: 60px; text-align: right; font-size: var(--er-font-size-sm);',
          escapeHtml(bar.weight.toFixed(1)),
        ),
      );
      card.appendChild(row);
    }

    // Footer
    const footer = createDiv(
      'margin-top: 8px; font-size: var(--er-font-size-sm); color: var(--er-color-prior);',
      `Pair: #${escapeHtml(this._data.recordPair.idA)} ↔ #${escapeHtml(this._data.recordPair.idB)}`,
    );
    card.appendChild(footer);

    resetShadowRoot(this.root, buildFullCss(), themeStyle, card);
  }
}

// ══════════════════════════════════════════════════════════════
// <er-histogram> — Match Weight Histogram Component
// ══════════════════════════════════════════════════════════════

export class ErHistogramElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: HistogramData | null = null;

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<HistogramData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.render();
    }
  }

  private render(): void {
    if (!this._data) {
      resetShadowRoot(
        this.root,
        buildFullCss(),
        createDiv('padding: 16px;', 'No histogram data loaded.'),
      );
      return;
    }

    const themeStyle = this.buildThemeStyle();
    const card = createDiv(CARD_CSS);
    const maxCount = Math.max(...this._data.bins.map((b) => b.count), 1);

    const header = createDiv(
      'font-size: var(--er-font-size-lg); margin-bottom: 12px;',
      'Match Weight Distribution',
    );
    card.appendChild(header);

    for (const bin of this._data.bins) {
      const row = createDiv(
        'display: flex; align-items: center; margin-bottom: var(--er-bar-gap);',
      );
      row.appendChild(
        createSpan(
          'width: 80px; font-size: var(--er-font-size-sm);',
          `[${escapeHtml(bin.minWeight)},${escapeHtml(bin.maxWeight)})`,
        ),
      );

      const barDiv = createDiv(
        `flex: 1; background: var(--er-color-primary); height: var(--er-bar-height); border-radius: var(--er-border-radius); min-width: 1px;`,
      );
      barDiv.style.width = `${(bin.count / maxCount) * 100}%`;
      row.appendChild(barDiv);

      row.appendChild(
        createSpan(
          'width: 40px; text-align: right; font-size: var(--er-font-size-sm);',
          escapeHtml(bin.count),
        ),
      );
      card.appendChild(row);
    }

    const summary = createDiv(
      'margin-top: 8px; font-size: var(--er-font-size-sm);',
      `Total: ${escapeHtml(this._data.summary.totalPairs)} | Above threshold: ${escapeHtml(this._data.summary.aboveThreshold)} | Below: ${escapeHtml(this._data.summary.belowThreshold)}`,
    );
    card.appendChild(summary);

    resetShadowRoot(this.root, buildFullCss(), themeStyle, card);
  }
}

// ═���════════════════════════════════════════════════════════════
// <er-cluster-explorer> — Cluster Tree Component
// ══════════════════════════════════════════════════════════════

export class ErClusterExplorerElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: ClusterExplorerData | null = null;

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<ClusterExplorerData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.render();
    }
  }

  private buildTreeNodeElement(
    node: ClusterTreeNode,
    depth: number,
  ): HTMLDivElement {
    const indent = depth * 16;
    const hasChildren = node.children && node.children.length > 0;
    const sizeInfo = node.size > 1 ? ` (${escapeHtml(node.size)} records)` : '';
    const icon = hasChildren ? '▸' : '•';

    const div = createDiv(
      `padding: 2px 0; padding-left: ${indent}px; cursor: ${hasChildren ? 'pointer' : 'default'}; font-size: var(--er-font-size-sm);`,
      `${icon} ${escapeHtml(node.label)}${sizeInfo}`,
    );

    if (hasChildren) {
      for (const child of node.children!) {
        div.appendChild(this.buildTreeNodeElement(child, depth + 1));
      }
    }

    return div;
  }

  private render(): void {
    if (!this._data) {
      resetShadowRoot(
        this.root,
        buildFullCss(),
        createDiv('padding: 16px;', 'No cluster data loaded.'),
      );
      return;
    }

    const themeStyle = this.buildThemeStyle();
    const card = createDiv(CARD_CSS);

    const header = createDiv(
      'font-size: var(--er-font-size-lg); margin-bottom: 8px;',
      'Cluster Explorer',
    );
    card.appendChild(header);

    const stats = createDiv(
      'font-size: var(--er-font-size-sm); margin-bottom: 12px;',
      `${escapeHtml(this._data.totalClusters)} clusters | ${escapeHtml(this._data.totalRecords)} records | ${escapeHtml(this._data.singletonCount)} singletons`,
    );
    card.appendChild(stats);

    if (this._data.tree && this._data.tree.children) {
      for (const child of this._data.tree.children) {
        card.appendChild(this.buildTreeNodeElement(child, 0));
      }
    } else {
      const noData = createDiv(
        'font-size: var(--er-font-size-md); color: var(--er-color-primary);',
        'No clusters to display',
      );
      card.appendChild(noData);
    }

    resetShadowRoot(this.root, buildFullCss(), themeStyle, card);
  }
}

// ══════════════════════════════════════════════════════════════
// <er-mu-chart> — m/u Parameter Chart Component
// ══════════════════════════════════════════════════════════════

export class ErMuChartElement extends ErBaseElement {
  static readonly observedAttributes = ['data', 'theme'];

  private _data: MuChartData | null = null;

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name === 'data') {
      this._data = this.parseDataAttr<MuChartData>(newValue);
      this.render();
    }
    if (name === 'theme') {
      this.render();
    }
  }

  private render(): void {
    if (!this._data) {
      resetShadowRoot(
        this.root,
        buildFullCss(),
        createDiv('padding: 16px;', 'No parameter data loaded.'),
      );
      return;
    }

    const themeStyle = this.buildThemeStyle();
    const card = createDiv(`${CARD_CSS} overflow-x: auto;`);

    const title = createDiv(
      'font-size: var(--er-font-size-lg); margin-bottom: 12px;',
      `m/u Parameters (λ=${escapeHtml(typeof this._data.lambda === 'number' ? this._data.lambda.toExponential(2) : String(this._data.lambda))})`,
    );
    card.appendChild(title);

    // Build table using safe DOM APIs
    const table = document.createElement('table');
    table.setAttribute(
      'style',
      'width: 100%; border-collapse: collapse;',
    );

    // thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.setAttribute(
      'style',
      'border-bottom: 2px solid var(--er-color-border);',
    );
    for (const headerText of ['Field', 'Level', 'm', 'u', 'Weight']) {
      const th = document.createElement('th');
      th.setAttribute('style', 'text-align: left; padding: 4px 8px;');
      th.textContent = headerText;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // tbody
    const tbody = document.createElement('tbody');
    for (const field of this._data.fields) {
      for (const level of field.levels) {
        const row = document.createElement('tr');
        row.setAttribute('style', 'font-size: var(--er-font-size-sm);');

        const tdField = document.createElement('td');
        tdField.setAttribute('style', 'padding: 4px 8px;');
        tdField.textContent = escapeHtml(field.field);
        row.appendChild(tdField);

        const tdLevel = document.createElement('td');
        tdLevel.setAttribute('style', 'padding: 4px 8px;');
        tdLevel.textContent = escapeHtml(level.label);
        row.appendChild(tdLevel);

        const tdM = document.createElement('td');
        tdM.setAttribute(
          'style',
          'padding: 4px 8px; color: var(--er-color-match);',
        );
        tdM.textContent = escapeHtml(level.mProbability.toFixed(4));
        row.appendChild(tdM);

        const tdU = document.createElement('td');
        tdU.setAttribute(
          'style',
          'padding: 4px 8px; color: var(--er-color-nonmatch);',
        );
        tdU.textContent = escapeHtml(level.uProbability.toFixed(4));
        row.appendChild(tdU);

        const tdWeight = document.createElement('td');
        tdWeight.setAttribute(
          'style',
          'padding: 4px 8px; font-weight: bold;',
        );
        tdWeight.textContent = `${level.weight >= 0 ? '+' : ''}${escapeHtml(level.weight.toFixed(2))}`;
        row.appendChild(tdWeight);

        tbody.appendChild(row);
      }
    }
    table.appendChild(tbody);
    card.appendChild(table);

    resetShadowRoot(this.root, buildFullCss(), themeStyle, card);
  }
}

/** Register all custom elements. Safe to call multiple times — idempotent. */
export function registerAllElements(): void {
  const elements: [string, CustomElementConstructor][] = [
    ['er-waterfall', ErWaterfallElement],
    ['er-histogram', ErHistogramElement],
    ['er-cluster-explorer', ErClusterExplorerElement],
    ['er-mu-chart', ErMuChartElement],
  ];

  for (const [name, ctor] of elements) {
    if (!customElements.get(name)) {
      customElements.define(name, ctor);
    }
  }
}
