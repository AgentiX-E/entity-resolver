// CLI TUI Diagnostics — ANSI escape code-based terminal rendering.
// Consumes entity-resolver-visual Layer 1 data (pure JSON).
// Designed for 80x24 minimum terminal size.

import type {
  WaterfallChartData,
  HistogramData,
  MuChartData,
  ClusterExplorerData,
} from '@agentix-e/entity-resolver-visual';

// ══════════════════════════════════════════════════════════════
// ANSI escape codes
// ══════════════════════════════════════════════════════════════

const CSI = '\x1b[';

const ansi = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  fg: {
    green: `${CSI}32m`,
    red: `${CSI}31m`,
    yellow: `${CSI}33m`,
    blue: `${CSI}34m`,
    magenta: `${CSI}35m`,
    cyan: `${CSI}36m`,
    white: `${CSI}37m`,
  },
  bg: {
    green: `${CSI}42m`,
    red: `${CSI}41m`,
    blue: `${CSI}44m`,
  },
  clear: `${CSI}2J${CSI}H`,
  cursor: {
    hide: `${CSI}?25l`,
    show: `${CSI}?25h`,
    move: (row: number, col: number) => `${CSI}${row};${col}H`,
  },
} as const;

/** Strip ANSI codes for width calculation. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/** Pad a string to a given width, ANSI-aware. */
function padRight(s: string, width: number): string {
  const visible = stripAnsi(s).length;
  return s + ' '.repeat(Math.max(0, width - visible));
}

// ══════════════════════════════════════════════════════════════
// TUI Waterfall Chart (ASCII)
// ══════════════════════════════════════════════════════════════

export function renderWaterfallTUI(data: WaterfallChartData, maxWidth = 60): string {
  const lines: string[] = [];
  lines.push(`${ansi.bold}Match Weight Waterfall${ansi.reset}`);
  lines.push(`${ansi.dim}Pair: #${data.recordPair.idA} ↔ #${data.recordPair.idB}${ansi.reset}`);
  lines.push('─'.repeat(maxWidth));

  for (const bar of data.bars) {
    const barLen = Math.max(1, Math.round(Math.abs(bar.weight) * 4));
    const fill = '█'.repeat(Math.min(barLen, maxWidth - 30));
    const color = bar.weight >= 0 ? ansi.fg.green : ansi.fg.red;
    const label = padRight(bar.label, 22);
    const value = bar.weight.toFixed(2).padStart(7);
    lines.push(`${label} ${color}${fill}${ansi.reset} ${value}`);
  }

  lines.push('─'.repeat(maxWidth));
  const prob = (data.matchProbability * 100).toFixed(1);
  lines.push(`${ansi.bold}Total: ${data.totalWeight.toFixed(2)} (${prob}%)${ansi.reset}`);
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// TUI Histogram (ASCII)
// ══════════════════════════════════════════════════════════════

export function renderHistogramTUI(data: HistogramData, maxWidth = 60): string {
  const lines: string[] = [];
  lines.push(`${ansi.bold}Match Weight Distribution${ansi.reset}`);
  lines.push('─'.repeat(maxWidth));

  const maxCount = Math.max(...data.bins.map((b: { count: number }) => b.count), 1);
  const barMax = maxWidth - 24;

  for (const bin of data.bins) {
    const barLen = Math.max(1, Math.round((bin.count / maxCount) * barMax));
    const fill = '█'.repeat(barLen);
    const range = `[${String(bin.minWeight).padStart(4)},${String(bin.maxWeight).padStart(4)})`;
    const count = String(bin.count).padStart(4);

    lines.push(`${range} ${ansi.fg.blue}${fill}${ansi.reset} ${count}`);
  }

  lines.push('─'.repeat(maxWidth));
  const t = data.threshold ?? 0;
  const aboveStr = `Above threshold (${t}): ${data.summary.aboveThreshold}`;
  const belowStr = `Below: ${data.summary.belowThreshold}`;
  lines.push(`${ansi.bold}Total: ${data.summary.totalPairs} pairs${ansi.reset}`);
  lines.push(`${ansi.fg.green}${aboveStr}${ansi.reset}  ${ansi.fg.red}${belowStr}${ansi.reset}`);
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// TUI m/u Parameter Table
// ══════════════════════════════════════════════════════════════

export function renderMuTableTUI(data: MuChartData, maxWidth = 72): string {
  const lines: string[] = [];
  lines.push(`${ansi.bold}m/u Parameters (λ = ${data.lambda.toExponential(2)})${ansi.reset}`);
  lines.push('─'.repeat(maxWidth));

  const header = `${ansi.dim}${padRight('Field', 16)} ${padRight('Level', 18)} ${padRight('m', 10)} ${padRight('u', 10)} Weight${ansi.reset}`;
  lines.push(header);
  lines.push('─'.repeat(maxWidth));

  for (const field of data.fields) {
    for (const level of field.levels) {
      const mStr = level.mProbability.toFixed(4).padStart(8);
      const uStr = level.uProbability.toFixed(4).padStart(8);
      const wStr = level.weight.toFixed(2).padStart(6);
      const wColor = level.weight >= 0 ? ansi.fg.green : ansi.fg.red;
      lines.push(
        `${padRight(field.field, 16)} ${padRight(level.label, 18)} ${mStr}    ${uStr}    ${wColor}${wStr}${ansi.reset}`,
      );
    }
  }

  lines.push('─'.repeat(maxWidth));
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// TUI Cluster Explorer (collapsible tree)
// ══════════════════════════════════════════════════════════════

export function renderClusterTreeTUI(data: ClusterExplorerData, maxWidth = 60): string {
  const lines: string[] = [];
  lines.push(`${ansi.bold}Cluster Explorer${ansi.reset}`);
  lines.push(
    `${ansi.dim}${data.totalClusters} clusters | ${data.totalRecords} records | ${data.singletonCount} singletons${ansi.reset}`,
  );
  lines.push('─'.repeat(maxWidth));

  const renderNode = (node: typeof data.tree, depth: number) => {
    const indent = '  '.repeat(depth);
    const prefix = node.children.length > 0 ? '▶ ' : '  ';
    const sizeInfo = node.size > 1 ? ` (${node.size})` : '';
    lines.push(`${indent}${prefix}${node.label}${ansi.dim}${sizeInfo}${ansi.reset}`);
    for (const child of node.children) {
      renderNode(child, depth + 1);
    }
  };

  renderNode(data.tree, 0);
  lines.push('─'.repeat(maxWidth));
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// TUI Threshold Selection Tool
// ══════════════════════════════════════════════════════════════

export function renderThresholdTUI(
  threshold: number,
  totalPairs: number,
  aboveThreshold: number,
  maxWidth = 50,
): string {
  const lines: string[] = [];
  lines.push(`${ansi.bold}Threshold Selection${ansi.reset}`);
  lines.push('─'.repeat(maxWidth));

  const pctAbove = totalPairs > 0 ? (aboveThreshold / totalPairs) * 100 : 0;
  const pctBelow = 100 - pctAbove;

  const barWidth = maxWidth - 10;
  const aboveLen = Math.round((pctAbove / 100) * barWidth);
  const belowLen = barWidth - aboveLen;

  const bar = `${ansi.bg.green}${' '.repeat(aboveLen)}${ansi.reset}${ansi.bg.red}${' '.repeat(belowLen)}${ansi.reset}`;

  lines.push(bar);
  lines.push('');
  lines.push(
    `${ansi.fg.green}▲ Above (${aboveThreshold} pairs, ${pctAbove.toFixed(1)}%)${ansi.reset}`,
  );
  lines.push(
    `${ansi.fg.red}▼ Below (${totalPairs - aboveThreshold} pairs, ${pctBelow.toFixed(1)}%)${ansi.reset}`,
  );
  lines.push('');
  lines.push(
    `Threshold: ${threshold.toFixed(2)}  ${ansi.fg.yellow}[← → adjust, Enter confirm]${ansi.reset}`,
  );
  lines.push('─'.repeat(maxWidth));
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// TUI Navigation hint line
// ══════════════════════════════════════════════════════════════

export function renderNavHint(): string {
  return [
    `${ansi.dim}h/j/k/l ←↓↑→ Navigate  │  Tab/Shift+Tab Switch Panel  │  q Quit${ansi.reset}`,
  ].join('\n');
}
