/**
 * Comparison Viewer — field-by-field pair detail table.
 *
 * Displays a side-by-side comparison of two records with
 * scorer, score, and comparison level for each field.
 * Color-coded by comparison level:
 *   exact_match → green, strong_match → light green
 *   moderate_match → yellow, weak_match → orange
 *   not_match → red
 */

/* eslint-disable @typescript-eslint/no-base-to-string -- Record<string,unknown> field values intentionally stringified for HTML display */

import type { PipelineResult, RawRecord } from '@agentix-e/entity-resolver-core';
import { escapeHtml } from '../components/web/elements.js';

const LEVEL_COLORS: Record<string, string> = {
  exact_match: '#34a853',
  strong_match: '#81c995',
  moderate_match: '#fbbc04',
  weak_match: '#f9ab00',
  not_match: '#ea4335',
};

const STYLES = `
:host {
  display: block;
  font-family: var(--er-font-family, system-ui, -apple-system, sans-serif);
}

.er-comparison-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--er-font-size-sm, 12px);
}

.er-comparison-table th {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 2px solid var(--er-color-border, #dadce0);
  font-weight: 600;
  color: #5f6368;
  white-space: nowrap;
}

.er-comparison-table td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--er-color-border, #dadce0);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.er-level-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.er-score-bar {
  display: inline-block;
  height: 6px;
  border-radius: 3px;
  min-width: 2px;
}

.er-empty-state {
  text-align: center;
  padding: 20px;
  color: #9aa0a6;
}
`;

/**
 * Comparison Viewer Custom Element.
 *
 * Usage:
 *   <er-comparison-viewer></er-comparison-viewer>
 *   viewer.load(pairIndex, pipelineResult, records)
 */
export class ComparisonViewer extends HTMLElement {
  private shadow: ShadowRoot;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `<style>${STYLES}</style><div id="content"><div class="er-empty-state">Select a pair to compare</div></div>`;
  }

  /**
   * Load comparison data for a specific pair.
   */
  load(pairIndex: number, result: PipelineResult, records: RawRecord[]): void {
    const pair = result.scoredPairs[pairIndex];
    const content = this.shadow.getElementById('content');
    if (!content) return;

    if (!pair) {
      content.innerHTML = '<div class="er-empty-state">No pair selected</div>';
      return;
    }

    const left = records[pair.leftId] ?? {};
    const right = records[pair.rightId] ?? {};

    // Build rows from diagnostic muParameters
    const rows: string[] = [
      '<tr><th>Field</th><th>Record A</th><th>Record B</th><th>Score</th><th>Level</th></tr>',
    ];

    for (const [field, params] of result.diagnostics.muParameters) {
      for (const [level, m] of params.mProbabilities) {
        const u = params.uProbabilities.get(level) ?? 0;
        const weight = u > 0 ? Math.log2(m / u) : 0;
        const color = LEVEL_COLORS[level] ?? '#9aa0a6';
        const scorePercent = Math.min(100, Math.max(0, Math.round(weight * 10 + 50)));

        rows.push(`
          <tr>
            <td><strong>${escapeHtml(field)}</strong></td>
            <td title="${escapeHtml(String(left[field] ?? ''))}">${escapeHtml(String(left[field] ?? '').slice(0, 40))}</td>
            <td title="${escapeHtml(String(right[field] ?? ''))}">${escapeHtml(String(right[field] ?? '').slice(0, 40))}</td>
            <td>
              <span class="er-score-bar" style="width:${scorePercent}px; background:${color}"></span>
              ${weight.toFixed(2)}
            </td>
            <td>
              <span class="er-level-indicator" style="background:${color}"></span>
              ${escapeHtml(level)}
            </td>
          </tr>
        `);
      }
    }

    const pairInfo = `
      <div style="padding:4px 0;font-size:12px;color:#5f6368">
        Pair #${pairIndex}: Record ${pair.leftId} ↔ Record ${pair.rightId} · 
        Probability: ${((pair.probability ?? pair.score) * 100).toFixed(1)}%
      </div>
    `;

    content.innerHTML = `${pairInfo}<table class="er-comparison-table">${rows.join('')}</table>`;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('er-comparison-viewer')) {
  customElements.define('er-comparison-viewer', ComparisonViewer);
}
