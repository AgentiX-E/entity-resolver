/**
 * Studio Pair Review — Web Component for side-by-side record comparison.
 *
 * Renders two records with field-level diff highlighting.
 * Zero framework dependencies. Extends visual package's ErBaseElement pattern.
 */
import type { StudioPair } from '../session.js';

const MATCH = '#16a34a';
const NO_MATCH = '#dc2626';
const SKIP = '#d97706';
const BG = '#fafafa';
const BORDER = '#e5e7eb';

export class StudioPairReviewElement extends HTMLElement {
  private _pair: StudioPair | null = null;
  private _index = 0;
  private _total = 0;

  connectedCallback(): void {
    this.render();
  }

  setPair(pair: StudioPair, index: number, total: number): void {
    this._pair = pair;
    this._index = index;
    this._total = total;
    if (this.isConnected) this.render();
  }

  private render(): void {
    const pair = this._pair;
    if (!pair) {
      this.innerHTML =
        '<div style="color:#9ca3af;text-align:center;padding:40px">No pair loaded</div>';
      return;
    }

    const fields = pair.fieldScores;
    const allNames = [...new Set([...Object.keys(pair.left), ...Object.keys(pair.right)])];

    const rows = allNames
      .map((f) => {
        const info = fields.find((s) => s.fieldName === f);
        const score = info?.score ?? 1.0;
        const bg = score < 0.6 ? MATCH : score < 0.9 ? SKIP : 'transparent';
        const lv = String(pair.left[f] ?? '');
        const rv = String(pair.right[f] ?? '');
        return `<tr>
        <td style="font-weight:600;font-size:13px;padding:4px 8px;white-space:nowrap">${esc(f)}</td>
        <td style="font-size:13px;padding:4px 8px;background:${lv !== rv ? bg : 'transparent'};word-break:break-word">${esc(lv)}</td>
        <td style="font-size:13px;padding:4px 8px;background:${lv !== rv ? bg : 'transparent'};word-break:break-word">${esc(rv)}</td>
      </tr>`;
      })
      .join('');

    this.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;border:1px solid ${BORDER};border-radius:8px;padding:16px;background:${BG};font-family:system-ui,sans-serif">
        <div style="font-weight:600;font-size:14px;border-bottom:1px solid ${BORDER};padding-bottom:4px">Record A</div>
        <div style="font-weight:600;font-size:14px;border-bottom:1px solid ${BORDER};padding-bottom:4px">Record B</div>
      </div>
      <div style="overflow-x:auto;margin-top:8px">
        <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif">
          <thead><tr style="background:${BG}">
            <th style="text-align:left;padding:6px 8px;font-size:12px;color:#6b7280;border-bottom:2px solid ${BORDER}">Field</th>
            <th style="text-align:left;padding:6px 8px;font-size:12px;color:#6b7280;border-bottom:2px solid ${BORDER}">Record A</th>
            <th style="text-align:left;padding:6px 8px;font-size:12px;color:#6b7280;border-bottom:2px solid ${BORDER}">Record B</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;padding:12px 0;font-family:system-ui,sans-serif">
        <button id="s-btn-y" style="background:${MATCH};color:white;border:none;padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer">Match (Y)</button>
        <button id="s-btn-s" style="background:${SKIP};color:white;border:none;padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer">Skip (S)</button>
        <button id="s-btn-n" style="background:${NO_MATCH};color:white;border:none;padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer">No Match (N)</button>
      </div>
      <div style="text-align:center;font-size:12px;color:#9ca3af;font-family:system-ui,sans-serif">
        Pair ${this._index + 1}/${this._total} · Score: ${(pair.machineScore * 100).toFixed(1)}% · Y/N/S keys
      </div>
    `;

    // Event wiring
    this.querySelector('#s-btn-y')?.addEventListener('click', () => { this.dispatch('match'); });
    this.querySelector('#s-btn-n')?.addEventListener('click', () => { this.dispatch('no-match'); });
    this.querySelector('#s-btn-s')?.addEventListener('click', () => { this.dispatch('skip'); });

    // Keyboard
    const handler = (e: KeyboardEvent) => {
      if (!this.isConnected) {
        document.removeEventListener('keydown', handler);
        return;
      }
      if (e.key === 'y') this.dispatch('match');
      if (e.key === 'n') this.dispatch('no-match');
      if (e.key === 's') this.dispatch('skip');
    };
    document.addEventListener('keydown', handler);
  }

  private dispatch(action: string): void {
    this.dispatchEvent(new CustomEvent('studio-action', { detail: { action }, bubbles: true }));
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (!customElements.get('studio-pair-review')) {
  customElements.define('studio-pair-review', StudioPairReviewElement);
}
