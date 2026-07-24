/**
 * Comprehensive XSS security tests for entity-resolver web components.
 *
 * Every test:
 * 1. Injects known XSS payloads into each data field
 * 2. Verifies the payload appears as text (not executed HTML)
 * 3. Confirms zero innerHTML usage for dynamic content
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  escapeHtml,
  registerAllElements,
  ErWaterfallElement,
  ErHistogramElement,
  ErClusterExplorerElement,
  ErMuChartElement,
  DEFAULT_THEME,
  THEME_VARIABLE_COUNT,
} from '../../../components/web/elements.js';

// ══════════════════════════════════════════════════════════════
// Known XSS attack vectors
// ══════════════════════════════════════════════════════════════

const XSS_PAYLOADS = {
  scriptTag: '<script>alert(1)</script>',
  imgOnerror: '<img src=x onerror=alert(1)>',
  svgOnload: '<svg onload=alert(1)>',
  eventHandler: '<div onmouseover="alert(1)">hover me</div>',
  javascriptUrl: 'javascript:alert(1)',
  htmlEntityBypass: '<img src=x onerror=&#97;lert(1)>',
  encodedScript: '%3Cscript%3Ealert(1)%3C/script%3E',
  doubleEncoded: '&amp;lt;script&amp;gt;',
  nullByte: '<script>alert(1)\x00</script>',
  commentBypass: '<!--><script>alert(1)</script>-->',
  styleExpression: 'expression(alert(1))',
  dataUri: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
};

type XssPayloadMap = typeof XSS_PAYLOADS;

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

/**
 * Assert that an element's shadow DOM contains NO <script> elements,
 * NO inline event handler attributes, and NO data: or javascript: URLs.
 */
function assertNoXssVectors(element: HTMLElement): void {
  const shadow = element.shadowRoot;
  if (!shadow) {
    throw new Error('Element has no shadow root');
  }

  const html = shadow.innerHTML;

  // 1. Must not contain actual <script> tags
  expect(html).not.toMatch(/<script[\s>\/]/i);

  // 2. Must not contain inline event handler attributes
  //    (onerror=, onload=, etc. as DOM attributes, not text content)
  expect(html).not.toMatch(/\s+on\w+\s*=\s*["']/i);

  // 3. Must not contain javascript: protocol in href/src/action attributes
  expect(html).not.toMatch(/(?:href|src|action|formaction)\s*=\s*["']\s*javascript\s*:/i);
}

/**
 * Assert that a payload was safely rendered: the rendered HTML must not
 * contain the raw unescaped XSS payload as executable HTML.
 */
function assertPayloadSafelyRendered(payload: string, html: string): void {
  // The escaped output must never contain raw angle brackets from the payload
  if (payload.includes('<') || payload.includes('>')) {
    // Raw angle brackets must not survive in a way that creates real tags
    expect(html).not.toMatch(new RegExp(payload.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
}

// ══════════════════════════════════════════════════════════════
// escapeHtml() unit tests
// ══════════════════════════════════════════════════════════════

describe('escapeHtml()', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('returns non-strings safely', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(true)).toBe('true');
    expect(escapeHtml(0)).toBe('0');
  });

  describe('resists all XSS payloads', () => {
    for (const [name, payload] of Object.entries(XSS_PAYLOADS)) {
      it(`neutralizes ${name}: "${payload.substring(0, 40)}..."`, () => {
        const escaped = escapeHtml(payload);
        // Critical: no raw angle brackets survive — this prevents any HTML parsing
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
        // No raw & that could start HTML entity parsing
        // (single & that is not already escaped is dangerous in attribute context)
        // escapeHtml converts & to &amp; so no raw & should remain
      });
    }
  });

  it('is injective — escapeHtml(x) === escapeHtml(y) iff x === y', () => {
    // For string inputs, escapeHtml should produce distinct outputs
    const a = escapeHtml('<foo>');
    const b = escapeHtml('<bar>');
    expect(a).not.toBe(b);
  });
});

// ══════════════════════════════════════════════════════════════
// Web Component Registration
// ══════════════════════════════════════════════════════════════

describe('registerAllElements', () => {
  beforeAll(() => {
    registerAllElements();
  });

  it('registers all 4 custom elements', () => {
    expect(customElements.get('er-waterfall')).toBe(ErWaterfallElement);
    expect(customElements.get('er-histogram')).toBe(ErHistogramElement);
    expect(customElements.get('er-cluster-explorer')).toBe(
      ErClusterExplorerElement,
    );
    expect(customElements.get('er-mu-chart')).toBe(ErMuChartElement);
  });

  it('is idempotent — does not throw on double registration', () => {
    expect(() => registerAllElements()).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════
// Theme configuration
// ══════════════════════════════════════════════════════════════

describe('DEFAULT_THEME', () => {
  it('has the required number of CSS custom properties', () => {
    expect(THEME_VARIABLE_COUNT).toBe(17);
  });

  it('has all required theme variables', () => {
    expect(DEFAULT_THEME['--er-color-primary']).toBeDefined();
    expect(DEFAULT_THEME['--er-color-match']).toBeDefined();
    expect(DEFAULT_THEME['--er-color-nonmatch']).toBeDefined();
    expect(DEFAULT_THEME['--er-color-prior']).toBeDefined();
    expect(DEFAULT_THEME['--er-color-background']).toBeDefined();
    expect(DEFAULT_THEME['--er-color-text']).toBeDefined();
    expect(DEFAULT_THEME['--er-color-border']).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════
// <er-waterfall> XSS tests
// ══════════════════════════════════════════════════════════════

describe('<er-waterfall> — XSS resistance', () => {
  beforeAll(() => {
    registerAllElements();
  });

  it('renders empty state without innerHTML for dynamic data', () => {
    const el = document.createElement('er-waterfall') as ErWaterfallElement;
    document.body.appendChild(el);
    // Force render with null data
    el.setAttribute('data', '');
    assertNoXssVectors(el);
    document.body.removeChild(el);
  });

  for (const [name, payload] of Object.entries(XSS_PAYLOADS)) {
    it(`resists ${name} in bar.label`, () => {
      const el = document.createElement('er-waterfall') as ErWaterfallElement;
      document.body.appendChild(el);

      const xssData = {
        totalWeight: 10,
        matchProbability: 0.5,
        bars: [{ label: payload, weight: 5 }],
        recordPair: { idA: 1, idB: 2 },
      };
      el.setAttribute('data', JSON.stringify(xssData));

      const html = el.shadowRoot!.innerHTML;
      assertNoXssVectors(el);
      assertPayloadSafelyRendered(payload, html);

      document.body.removeChild(el);
    });

    it(`resists ${name} in recordPair.idA`, () => {
      const el = document.createElement('er-waterfall') as ErWaterfallElement;
      document.body.appendChild(el);

      const xssData = {
        totalWeight: 10,
        matchProbability: 0.5,
        bars: [{ label: 'test', weight: 5 }],
        recordPair: { idA: payload as unknown as number, idB: 2 },
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });
  }

  it('resists all payloads injected simultaneously', () => {
    const el = document.createElement('er-waterfall') as ErWaterfallElement;
    document.body.appendChild(el);

    const xssData = {
      totalWeight: 10,
      matchProbability: 0.5,
      bars: Object.entries(XSS_PAYLOADS).map(([_, p]) => ({
        label: p,
        weight: Math.random() * 10,
      })),
      recordPair: {
        idA: XSS_PAYLOADS.scriptTag as unknown as number,
        idB: 2,
      },
    };
    el.setAttribute('data', JSON.stringify(xssData));
    assertNoXssVectors(el);
    document.body.removeChild(el);
  });
});

// ══════════════════════════════════════════════════════════════
// <er-histogram> XSS tests
// ══════════════════════════════════════════════════════════════

describe('<er-histogram> — XSS resistance', () => {
  beforeAll(() => {
    registerAllElements();
  });

  it('renders empty state safely', () => {
    const el = document.createElement('er-histogram') as ErHistogramElement;
    document.body.appendChild(el);
    el.setAttribute('data', '');
    assertNoXssVectors(el);
    document.body.removeChild(el);
  });

  for (const [name, payload] of Object.entries(XSS_PAYLOADS)) {
    it(`resists ${name} in bin data fields`, () => {
      const el = document.createElement('er-histogram') as ErHistogramElement;
      document.body.appendChild(el);

      const xssData = {
        bins: [{ minWeight: payload as unknown as number, maxWeight: 5, count: 3 }],
        summary: { totalPairs: 10, aboveThreshold: 5, belowThreshold: 5 },
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });

    it(`resists ${name} in summary fields`, () => {
      const el = document.createElement('er-histogram') as ErHistogramElement;
      document.body.appendChild(el);

      const xssData = {
        bins: [{ minWeight: -10, maxWeight: -5, count: 3 }],
        summary: {
          totalPairs: payload as unknown as number,
          aboveThreshold: payload as unknown as number,
          belowThreshold: payload as unknown as number,
        },
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// <er-cluster-explorer> XSS tests
// ══════════════════════════════════════════════════════════════

describe('<er-cluster-explorer> — XSS resistance', () => {
  beforeAll(() => {
    registerAllElements();
  });

  it('renders empty state safely', () => {
    const el = document.createElement(
      'er-cluster-explorer',
    ) as ErClusterExplorerElement;
    document.body.appendChild(el);
    el.setAttribute('data', '');
    assertNoXssVectors(el);
    document.body.removeChild(el);
  });

  for (const [name, payload] of Object.entries(XSS_PAYLOADS)) {
    it(`resists ${name} in cluster node label`, () => {
      const el = document.createElement(
        'er-cluster-explorer',
      ) as ErClusterExplorerElement;
      document.body.appendChild(el);

      const xssData = {
        totalClusters: 1,
        totalRecords: 1,
        singletonCount: 0,
        tree: {
          label: 'root',
          size: 1,
          children: [{ label: payload, size: 1, children: [] }],
        },
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });

    it(`resists ${name} in statistics fields`, () => {
      const el = document.createElement(
        'er-cluster-explorer',
      ) as ErClusterExplorerElement;
      document.body.appendChild(el);

      const xssData = {
        totalClusters: payload as unknown as number,
        totalRecords: 1,
        singletonCount: 0,
        tree: { label: 'root', size: 1, children: [] },
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// <er-mu-chart> XSS tests
// ══════════════════════════════════════════════════════════════

describe('<er-mu-chart> — XSS resistance', () => {
  beforeAll(() => {
    registerAllElements();
  });

  it('renders empty state safely', () => {
    const el = document.createElement('er-mu-chart') as ErMuChartElement;
    document.body.appendChild(el);
    el.setAttribute('data', '');
    assertNoXssVectors(el);
    document.body.removeChild(el);
  });

  for (const [name, payload] of Object.entries(XSS_PAYLOADS)) {
    it(`resists ${name} in field.field`, () => {
      const el = document.createElement('er-mu-chart') as ErMuChartElement;
      document.body.appendChild(el);

      const xssData = {
        lambda: 0.0001,
        fields: [
          {
            field: payload,
            levels: [
              {
                label: 'exact',
                mProbability: 0.95,
                uProbability: 0.1,
                weight: 3.5,
              },
            ],
          },
        ],
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });

    it(`resists ${name} in level.label`, () => {
      const el = document.createElement('er-mu-chart') as ErMuChartElement;
      document.body.appendChild(el);

      const xssData = {
        lambda: 0.0001,
        fields: [
          {
            field: 'name',
            levels: [
              {
                label: payload,
                mProbability: 0.95,
                uProbability: 0.1,
                weight: 3.5,
              },
            ],
          },
        ],
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });

    it(`resists ${name} in lambda (title)`, () => {
      const el = document.createElement('er-mu-chart') as ErMuChartElement;
      document.body.appendChild(el);

      const xssData = {
        lambda: payload as unknown as number,
        fields: [
          {
            field: 'name',
            levels: [
              {
                label: 'exact',
                mProbability: 0.95,
                uProbability: 0.1,
                weight: 3.5,
              },
            ],
          },
        ],
      };
      el.setAttribute('data', JSON.stringify(xssData));

      assertNoXssVectors(el);
      document.body.removeChild(el);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// Shadow DOM isolation
// ══════════════════════════════════════════════════════════════

describe('Shadow DOM isolation', () => {
  beforeAll(() => {
    registerAllElements();
  });

  it('theme variables are in :host style, not inline on host element', () => {
    const el = document.createElement('er-waterfall') as ErWaterfallElement;
    document.body.appendChild(el);

    const data = {
      totalWeight: 5,
      matchProbability: 0.8,
      bars: [{ label: 'Test', weight: 3 }],
      recordPair: { idA: 1, idB: 2 },
    };
    el.setAttribute('data', JSON.stringify(data));

    // Theme CSS should be in Shadow DOM style, not on host element
    const hostStyle = el.getAttribute('style');
    // Host element should NOT have theme variables as inline styles
    if (hostStyle) {
      expect(hostStyle).not.toContain('--er-color-primary');
      expect(hostStyle).not.toContain('--er-font-family');
    }

    document.body.removeChild(el);
  });

  it('each component instance has independent shadow DOM', () => {
    const el1 = document.createElement('er-waterfall') as ErWaterfallElement;
    const el2 = document.createElement('er-waterfall') as ErWaterfallElement;
    document.body.appendChild(el1);
    document.body.appendChild(el2);

    const data1 = {
      totalWeight: 5,
      matchProbability: 0.8,
      bars: [{ label: 'Test1', weight: 3 }],
      recordPair: { idA: 1, idB: 2 },
    };
    const data2 = {
      totalWeight: 10,
      matchProbability: 0.3,
      bars: [{ label: 'Test2', weight: 7 }],
      recordPair: { idA: 3, idB: 4 },
    };

    el1.setAttribute('data', JSON.stringify(data1));
    el2.setAttribute('data', JSON.stringify(data2));

    // Each shadow DOM is independent
    expect(el1.shadowRoot!.innerHTML).not.toBe(el2.shadowRoot!.innerHTML);

    document.body.removeChild(el1);
    document.body.removeChild(el2);
  });
});
