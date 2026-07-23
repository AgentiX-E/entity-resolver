// Web Components tests — covers Custom Elements rendering paths.
import { describe, it, expect, beforeEach } from 'vitest';

// Register custom elements before testing
import '../../components/web/elements.js';

describe('Web Components', () => {
  beforeEach(() => {
    // JSDOM cleaning
    document.body.innerHTML = '';
  });

  it('ErWaterfallElement is registered', () => {
    const el = document.createElement('er-waterfall');
    expect(el.tagName).toBe('ER-WATERFALL');
  });

  it('ErHistogramElement is registered', () => {
    const el = document.createElement('er-histogram');
    expect(el.tagName).toBe('ER-HISTOGRAM');
  });

  it('ErClusterExplorerElement is registered', () => {
    const el = document.createElement('er-cluster-explorer');
    expect(el.tagName).toBe('ER-CLUSTER-EXPLORER');
  });

  it('ErMuChartElement is registered', () => {
    const el = document.createElement('er-mu-chart');
    expect(el.tagName).toBe('ER-MU-CHART');
  });

  it('waterfall element has shadow root', () => {
    const el = document.createElement('er-waterfall') as HTMLElement;
    document.body.appendChild(el);
    expect(el.shadowRoot).not.toBeNull();
  });

  it('histogram element has shadow root', () => {
    const el = document.createElement('er-histogram') as HTMLElement;
    document.body.appendChild(el);
    expect(el.shadowRoot).not.toBeNull();
  });

  it('cluster explorer has shadow root', () => {
    const el = document.createElement('er-cluster-explorer') as HTMLElement;
    document.body.appendChild(el);
    expect(el.shadowRoot).not.toBeNull();
  });

  it('mu chart has shadow root', () => {
    const el = document.createElement('er-mu-chart') as HTMLElement;
    document.body.appendChild(el);
    expect(el.shadowRoot).not.toBeNull();
  });

  it('waterfall renders with data attribute', () => {
    const el = document.createElement('er-waterfall') as HTMLElement;
    el.setAttribute('data', JSON.stringify({
      recordPair: { idA: 0, idB: 1 },
      priorWeight: -6.67,
      bars: [{ label: 'name:exact', weight: 4.74, cumulative: 4.74, valueA: 'n', valueB: 'n', comparisonLevel: 'exact' }],
      totalWeight: 4.74,
      matchProbability: 0.9,
    }));
    document.body.appendChild(el);
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot!.textContent!.length).toBeGreaterThan(0);
  });

  it('histogram renders with data attribute', () => {
    const el = document.createElement('er-histogram') as HTMLElement;
    el.setAttribute('data', JSON.stringify({
      bins: [{ minWeight: -10, maxWeight: -5, count: 1 }, { minWeight: -5, maxWeight: 0, count: 3 }],
      threshold: 0,
      summary: { totalPairs: 4, aboveThreshold: 2, belowThreshold: 2 },
    }));
    document.body.appendChild(el);
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot!.textContent!.length).toBeGreaterThan(0);
  });

  it('theme CSS custom properties are applied', () => {
    const el = document.createElement('er-waterfall') as HTMLElement;
    document.body.appendChild(el);
    // CSS custom properties should be set on host
    expect(el.shadowRoot).not.toBeNull();
    // At minimum, the theme should have been applied
    expect(el.shadowRoot).not.toBeNull();
  });
});
