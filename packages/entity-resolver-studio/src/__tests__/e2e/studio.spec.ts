/**
 * Studio E2E Tests — Playwright Chromium.
 *
 * Tests StudioPairReviewElement rendering, interactions, and keyboard
 * shortcuts in a real browser DOM environment.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const componentJs = readFileSync(resolve('dist/components/pair-review.js'), 'utf-8');

async function injectComponent(page: any) {
  await page.setContent(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><div id="app"></div></body></html>',
  );
  await page.addScriptTag({ content: componentJs, type: 'module' });
  await page.waitForTimeout(100);
}

test.describe('StudioPairReviewElement', () => {
  test.beforeEach(async ({ page }) => {
    await injectComponent(page);
  });

  test('registers custom element', async ({ page }) => {
    const defined = await page.evaluate(
      () => customElements.get('studio-pair-review') !== undefined,
    );
    expect(defined).toBe(true);
  });

  test('renders empty state', async ({ page }) => {
    const html = await page.evaluate(() => {
      const el = document.createElement('studio-pair-review');
      document.getElementById('app')!.appendChild(el);
      return el.innerHTML;
    });
    expect(html).toContain('No pair loaded');
  });

  test('renders record data via setPair()', async ({ page }) => {
    const html = await page.evaluate(() => {
      const el = document.createElement('studio-pair-review') as any;
      document.getElementById('app')!.appendChild(el);
      el.setPair(
        {
          id: 'p1',
          left: { name: 'Alice', city: 'NYC' },
          right: { name: 'Alicia', city: 'LA' },
          machineScore: 0.72,
          fieldScores: [
            { fieldName: 'name', score: 0.8 },
            { fieldName: 'city', score: 0.3 },
          ],
          label: null,
          labeledAt: null,
        },
        0,
        5,
      );
      return el.innerHTML;
    });

    expect(html).toContain('Record A');
    expect(html).toContain('Record B');
    expect(html).toContain('Alice');
    expect(html).toContain('Pair 1/5');
    expect(html).toContain('72.0%');
  });

  test('renders action buttons', async ({ page }) => {
    const btns = await page.evaluate(() => {
      const el = document.createElement('studio-pair-review') as any;
      document.getElementById('app')!.appendChild(el);
      el.setPair(
        {
          id: 'p1',
          left: { name: 'A' },
          right: { name: 'B' },
          machineScore: 0.5,
          fieldScores: [],
          label: null,
          labeledAt: null,
        },
        0,
        1,
      );
      return Array.from(el.querySelectorAll('button')).map((b: any) => b.textContent);
    });
    expect(btns.some((b: string) => b.includes('Match'))).toBe(true);
    expect(btns.some((b: string) => b.includes('No Match'))).toBe(true);
    expect(btns.some((b: string) => b.includes('Skip'))).toBe(true);
  });

  test('Match button dispatches studio-action event', async ({ page }) => {
    const action = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const el = document.createElement('studio-pair-review') as any;
        document.getElementById('app')!.appendChild(el);
        el.setPair(
          {
            id: 'p1',
            left: {},
            right: {},
            machineScore: 0.5,
            fieldScores: [],
            label: null,
            labeledAt: null,
          },
          0,
          1,
        );
        el.addEventListener('studio-action', (ev: Event) =>
          { resolve((ev as CustomEvent).detail.action); },
        );
        const btn = el.querySelector('#s-btn-y') as HTMLButtonElement;
        btn?.click();
      });
    });
    expect(action).toBe('match');
  });

  test('No-Match button dispatches studio-action', async ({ page }) => {
    const action = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const el = document.createElement('studio-pair-review') as any;
        document.getElementById('app')!.appendChild(el);
        el.setPair(
          {
            id: 'p1',
            left: {},
            right: {},
            machineScore: 0.5,
            fieldScores: [],
            label: null,
            labeledAt: null,
          },
          0,
          1,
        );
        el.addEventListener('studio-action', (ev: Event) =>
          { resolve((ev as CustomEvent).detail.action); },
        );
        const btn = el.querySelector('#s-btn-n') as HTMLButtonElement;
        btn?.click();
      });
    });
    expect(action).toBe('no-match');
  });

  test('Y key dispatches match action', async ({ page }) => {
    const action = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const el = document.createElement('studio-pair-review') as any;
        document.getElementById('app')!.appendChild(el);
        el.setPair(
          {
            id: 'p1',
            left: {},
            right: {},
            machineScore: 0.5,
            fieldScores: [],
            label: null,
            labeledAt: null,
          },
          0,
          1,
        );
        const onAction = (ev: Event) => {
          el.removeEventListener('studio-action', onAction);
          resolve((ev as CustomEvent).detail.action);
        };
        el.addEventListener('studio-action', onAction);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }));
      });
    });
    expect(action).toBe('match');
  });

  test('N key dispatches no-match action', async ({ page }) => {
    const action = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const el = document.createElement('studio-pair-review') as any;
        document.getElementById('app')!.appendChild(el);
        el.setPair(
          {
            id: 'p1',
            left: {},
            right: {},
            machineScore: 0.5,
            fieldScores: [],
            label: null,
            labeledAt: null,
          },
          0,
          1,
        );
        el.addEventListener('studio-action', (ev: Event) =>
          { resolve((ev as CustomEvent).detail.action); },
        );
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      });
    });
    expect(action).toBe('no-match');
  });

  test('S key dispatches skip action', async ({ page }) => {
    const action = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const el = document.createElement('studio-pair-review') as any;
        document.getElementById('app')!.appendChild(el);
        el.setPair(
          {
            id: 'p1',
            left: {},
            right: {},
            machineScore: 0.5,
            fieldScores: [],
            label: null,
            labeledAt: null,
          },
          0,
          1,
        );
        el.addEventListener('studio-action', (ev: Event) =>
          { resolve((ev as CustomEvent).detail.action); },
        );
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
      });
    });
    expect(action).toBe('skip');
  });
});
