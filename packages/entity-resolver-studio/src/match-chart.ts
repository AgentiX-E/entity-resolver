/**
 * Match Weight Histogram — lightweight visualization component.
 *
 * Renders a CSS-only bar chart showing the distribution of match
 * weights (probability scores) from the pipeline output.
 *
 * Usage: append to any container element.
 *   import { renderMatchChart } from './match-chart.js';
 *   renderMatchChart(container, scoredPairs);
 */
export function renderMatchChart(container: HTMLElement, pairs: { score: number }[]): void {
  const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const counts = new Array(bins.length - 1).fill(0);
  for (const p of pairs) {
    for (let i = 0; i < bins.length - 1; i++) {
      if (p.score >= bins[i]! && p.score < bins[i + 1]!) {
        counts[i]++;
        break;
      }
      if (i === bins.length - 2 && p.score >= 1.0) counts[i]++;
    }
  }

  const maxCount = Math.max(1, ...counts);
  const bars = counts
    .map(
      (c, i) =>
        `<div style="display:flex;align-items:center;margin:4px 0;font-size:12px;font-family:monospace">
          <span style="width:55px;text-align:right;margin-right:8px">${bins[i]!.toFixed(1)}-${bins[i + 1]!.toFixed(1)}</span>
          <div style="flex:1;height:18px;background:#e5e7eb;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round((c / maxCount) * 100)}%;background:linear-gradient(90deg,#3b82f6,#16a34a);min-width:${c > 0 ? 2 : 0}px;border-radius:3px"></div>
          </div>
          <span style="width:40px;margin-left:6px;color:#6b7280">${c}</span>
        </div>`,
    )
    .join('');

  container.innerHTML = `
    <div style="font-family:system-ui,sans-serif;padding:16px;background:white;border-radius:8px;border:1px solid #e5e7eb">
      <h3 style="font-size:14px;font-weight:600;margin:0 0 12px">Match Weight Distribution</h3>
      ${bars}
      <div style="margin-top:8px;font-size:11px;color:#9ca3af">${pairs.length} pairs · bins: score range → count</div>
    </div>`;
}
