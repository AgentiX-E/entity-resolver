/**
 * SVG Chart Utilities for Web Components.
 * Pure SVG DOM construction — zero dependencies (no D3, no Chart.js).
 * Produces responsive, accessible SVG charts compatible with Shadow DOM.
 */

/** SVG namespace constant. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes. */
function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

/** Chart dimensions with margins. */
interface ChartDims {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  innerW: number;
  innerH: number;
}

/** Build chart dimensions from container width. */
function chartDims(containerWidth: number, ratio = 16 / 9): ChartDims {
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = Math.max(200, containerWidth);
  const height = Math.max(150, Math.round(width / ratio));
  return {
    width,
    height,
    margin,
    innerW: width - margin.left - margin.right,
    innerH: height - margin.top - margin.bottom,
  };
}

// ═══════════════════════════════════════════════════════════════
// Waterfall SVG Chart
// ═══════════════════════════════════════════════════════════════

import type { WaterfallChartData } from '../../data/api.js';

export function renderWaterfallSvg(
  data: WaterfallChartData,
  containerWidth: number = 600,
): SVGSVGElement {
  const d = chartDims(containerWidth, 3);
  const svg = svgEl('svg', {
    width: d.width,
    height: d.height,
    viewBox: `0 0 ${d.width} ${d.height}`,
    role: 'img',
    'aria-label': `Waterfall chart: match weight ${data.totalWeight.toFixed(2)}`,
  });

  // Background
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: d.width, height: d.height, fill: '#fff' }));
  const g = svgEl('g', { transform: `translate(${d.margin.left},${d.margin.top})` });

  // Find max cumulative for scaling
  let maxCum = 0;
  let minCum = 0;
  for (const b of data.bars) {
    const start = b.cumulative - b.weight;
    const end = b.cumulative;
    if (start < minCum) minCum = start;
    if (end > maxCum) maxCum = end;
  }
  const absMax = Math.max(Math.abs(minCum), Math.abs(maxCum), 1);
  const zeroY = (absMax / (2 * absMax)) * d.innerH;

  // Zero line
  g.appendChild(
    svgEl('line', {
      x1: 0,
      y1: zeroY,
      x2: d.innerW,
      y2: zeroY,
      stroke: '#9aa0a6',
      'stroke-dasharray': '4,4',
      'stroke-width': '1',
    }),
  );

  // Y-axis labels
  for (
    let v = Math.ceil(-absMax);
    v <= Math.ceil(absMax);
    v += Math.max(1, Math.ceil(absMax / 4))
  ) {
    const yPos = zeroY - (v / absMax) * d.innerH * 0.9;
    if (yPos >= 0 && yPos <= d.innerH) {
      g.appendChild(
        svgEl('line', {
          x1: 0,
          y1: yPos,
          x2: d.innerW,
          y2: yPos,
          stroke: '#eee',
          'stroke-width': '0.5',
        }),
      );
      const txt = svgEl('text', {
        x: -5,
        y: yPos + 4,
        'text-anchor': 'end',
        'font-size': '10',
        fill: '#5f6368',
      });
      txt.textContent = String(Math.round(v));
      g.appendChild(txt);
    }
  }

  // Bars
  for (const bar of data.bars) {
    const startY = zeroY - ((bar.cumulative - bar.weight) / absMax) * d.innerH * 0.9;
    const endY = zeroY - (bar.cumulative / absMax) * d.innerH * 0.9;
    const barH2 = Math.abs(endY - startY);
    const barY = Math.min(startY, endY);
    const color = bar.weight >= 0 ? '#34a853' : '#ea4335';

    // Connector line
    g.appendChild(
      svgEl('line', {
        x1: 10,
        y1: barY + barH2 / 2,
        x2: 30,
        y2: barY + barH2 / 2,
        stroke: '#dadce0',
        'stroke-width': '1',
      }),
    );

    // Bar
    g.appendChild(
      svgEl('rect', {
        x: 30,
        y: barY,
        width: d.innerW - 120,
        height: Math.max(1, barH2),
        fill: color,
        rx: '3',
      }),
    );

    // Label
    const lbl = svgEl('text', {
      x: 0,
      y: barY + barH2 / 2 + 4,
      'font-size': '11',
      fill: '#202124',
      'font-family': 'system-ui',
    });
    lbl.textContent = bar.label;
    g.appendChild(lbl);

    // Value
    const val = svgEl('text', {
      x: d.innerW - 5,
      y: barY + barH2 / 2 + 4,
      'text-anchor': 'end',
      'font-size': '10',
      fill: '#5f6368',
    });
    val.textContent = bar.weight >= 0 ? `+${bar.weight.toFixed(1)}` : bar.weight.toFixed(1);
    g.appendChild(val);
  }

  svg.appendChild(g);

  // Title
  const title = svgEl('text', {
    x: d.width / 2,
    y: 16,
    'text-anchor': 'middle',
    'font-size': '13',
    'font-weight': 'bold',
    fill: '#202124',
    'font-family': 'system-ui',
  });
  title.textContent = `Match Weight ${data.totalWeight.toFixed(2)} (${(data.matchProbability * 100).toFixed(0)}%)`;
  svg.appendChild(title);

  return svg;
}

// ═══════════════════════════════════════════════════════════════
// Histogram SVG Chart
// ═══════════════════════════════════════════════════════════════

import type { HistogramData } from '../../data/api.js';

export function renderHistogramSvg(
  data: HistogramData,
  containerWidth: number = 600,
): SVGSVGElement {
  const d = chartDims(containerWidth, 2.5);
  const svg = svgEl('svg', {
    width: d.width,
    height: d.height,
    viewBox: `0 0 ${d.width} ${d.height}`,
    role: 'img',
  });
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: d.width, height: d.height, fill: '#fff' }));
  const g = svgEl('g', { transform: `translate(${d.margin.left},${d.margin.top})` });

  const maxCount = Math.max(...data.bins.map((b) => b.count), 1);
  const binW = Math.max(4, d.innerW / data.bins.length - 2);

  // Y axis
  for (let v = 0; v <= maxCount; v += Math.max(1, Math.ceil(maxCount / 4))) {
    const y = d.innerH - (v / maxCount) * d.innerH;
    g.appendChild(
      svgEl('line', { x1: 0, y1: y, x2: d.innerW, y2: y, stroke: '#eee', 'stroke-width': '0.5' }),
    );
    const txt = svgEl('text', {
      x: -5,
      y: y + 4,
      'text-anchor': 'end',
      'font-size': '10',
      fill: '#5f6368',
    });
    txt.textContent = String(v);
    g.appendChild(txt);
  }

  // Threshold line
  if (data.threshold !== undefined) {
    const threshX =
      20 +
      (Math.max(0, data.threshold - (data.bins[0]?.minWeight ?? 0)) /
        ((data.bins[data.bins.length - 1]?.maxWeight ?? 1) - (data.bins[0]?.minWeight ?? 0))) *
        (d.innerW - 40);
    g.appendChild(
      svgEl('line', {
        x1: threshX,
        y1: 0,
        x2: threshX,
        y2: d.innerH,
        stroke: '#ea4335',
        'stroke-width': '1.5',
        'stroke-dasharray': '6,3',
      }),
    );
    const tTxt = svgEl('text', { x: threshX + 4, y: 12, 'font-size': '10', fill: '#ea4335' });
    tTxt.textContent = `T=${data.threshold}`;
    g.appendChild(tTxt);
  }

  // Bars
  for (let i = 0; i < data.bins.length; i++) {
    const bin = data.bins[i]!;
    const x = i * (binW + 2);
    const h = Math.max(1, (bin.count / maxCount) * d.innerH);
    const y = d.innerH - h;
    const fill =
      data.threshold !== undefined && bin.minWeight >= data.threshold ? '#34a853' : '#1a73e8';
    g.appendChild(svgEl('rect', { x, y, width: binW, height: h, fill, rx: '2' }));

    // X label (every other to avoid clutter)
    if (i % Math.max(1, Math.floor(data.bins.length / 8)) === 0) {
      const xlbl = svgEl('text', {
        x: x + binW / 2,
        y: d.innerH + 16,
        'text-anchor': 'middle',
        'font-size': '9',
        fill: '#5f6368',
      });
      xlbl.textContent = String(bin.minWeight);
      g.appendChild(xlbl);
    }
  }

  svg.appendChild(g);

  // Legend
  const legend = svgEl('g', { transform: `translate(${d.width - 200}, ${d.height - 16})` });
  const lr = svgEl('rect', { x: 0, y: 0, width: 10, height: 10, fill: '#34a853', rx: '2' });
  const lt = svgEl('text', { x: 14, y: 9, 'font-size': '10', fill: '#202124' });
  lt.textContent = `Above: ${data.summary.aboveThreshold}  Below: ${data.summary.belowThreshold}`;
  legend.appendChild(lr);
  legend.appendChild(lt);
  svg.appendChild(legend);

  return svg;
}

// ═══════════════════════════════════════════════════════════════
// Evaluation Radar SVG Chart
// ═══════════════════════════════════════════════════════════════

import type { EvaluationRadarData } from '../../data/api.js';

export function renderEvaluationRadarSvg(
  data: EvaluationRadarData,
  containerWidth: number = 400,
): SVGSVGElement {
  const size = Math.min(400, containerWidth);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40;
  const svg = svgEl('svg', {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    role: 'img',
  });

  // Grid circles
  for (let level = 1; level <= 4; level++) {
    svg.appendChild(
      svgEl('circle', {
        cx,
        cy,
        r: (r * level) / 4,
        fill: 'none',
        stroke: '#eee',
        'stroke-width': '0.5',
      }),
    );
    const lbl = svgEl('text', {
      x: cx,
      y: cy - (r * level) / 4 - 3,
      'text-anchor': 'middle',
      'font-size': '8',
      fill: '#dadce0',
    });
    lbl.textContent = (level / 4).toFixed(2);
    svg.appendChild(lbl);
  }

  // Axis lines
  const N = data.axes.length;
  for (let i = 0; i < N; i++) {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    svg.appendChild(
      svgEl('line', {
        x1: cx,
        y1: cy,
        x2: cx + r * Math.cos(angle),
        y2: cy + r * Math.sin(angle),
        stroke: '#eee',
        'stroke-width': '0.5',
      }),
    );
    const lbl = svgEl('text', {
      x: cx + (r + 14) * Math.cos(angle),
      y: cy + (r + 14) * Math.sin(angle) + 4,
      'text-anchor': 'middle',
      'font-size': '9',
      fill: '#202124',
    });
    lbl.textContent = data.axes[i]!.name.split('_')[0]!;
    svg.appendChild(lbl);
  }

  // Data polygon
  const points = data.axes
    .map((axis, i) => {
      const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
      const dist = r * axis.value;
      return `${cx + dist * Math.cos(angle)},${cy + dist * Math.sin(angle)}`;
    })
    .join(' ');

  svg.appendChild(
    svgEl('polygon', {
      points,
      fill: 'rgba(26,115,232,0.2)',
      stroke: '#1a73e8',
      'stroke-width': '2',
    }),
  );

  // Center label
  const f1 = data.axes.find((a) => a.name === 'Pairwise F1')?.value ?? 0;
  const centerLabel = svgEl('text', {
    x: cx,
    y: cy + 4,
    'text-anchor': 'middle',
    'font-size': '10',
    'font-weight': 'bold',
    fill: '#202124',
  });
  centerLabel.textContent = `F1: ${f1.toFixed(3)}`;
  svg.appendChild(centerLabel);

  return svg;
}
