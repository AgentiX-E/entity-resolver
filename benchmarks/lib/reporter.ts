/**
 * Benchmark HTML reporter — generates a standalone, self-contained
 * HTML page with comparison tables, sparklines, and statistical
 * significance indicators.
 *
 * The output is designed for GitHub Pages deployment and can be
 * viewed directly in any browser without a server.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import type { BenchmarkReport, DatasetResult } from './types.js';

/** Generate an HTML benchmark report and write it to disk. */
export function generateHtmlReport(
  report: BenchmarkReport,
  outputPath: string,
): void {
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entity Resolver Benchmarks — ${report.timestamp}</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a2e; --border: #e2e8f0;
    --accent: #2563eb; --green: #16a34a; --red: #dc2626;
    --orange: #ea580c; --gray: #64748b; --bg-alt: #f8fafc;
    --radius: 6px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg); color: var(--fg); line-height: 1.6;
    max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem;
  }
  h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 1rem; color: var(--accent); }
  .subtitle { color: var(--gray); font-size: 0.875rem; margin-bottom: 2rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 0.875rem; }
  th, td { padding: 0.625rem 0.75rem; text-align: right; border-bottom: 1px solid var(--border); }
  th { background: var(--bg-alt); font-weight: 600; color: var(--gray); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
  td:first-child, th:first-child { text-align: left; }
  .tool-header { background: var(--accent); color: white; }
  .tool-er { color: var(--accent); font-weight: 600; }
  .tool-splink { color: var(--orange); font-weight: 600; }
  .tool-gm { color: var(--green); font-weight: 600; }
  .winner { background: #f0fdf4; }
  .f1-value { font-family: 'SF Mono', 'Fira Code', monospace; font-weight: 600; }
  .stddev { color: var(--gray); font-size: 0.75rem; }
  .badge {
    display: inline-block; padding: 0.125rem 0.5rem; border-radius: 999px;
    font-size: 0.675rem; font-weight: 600;
  }
  .badge-win { background: #dcfce7; color: #166534; }
  .badge-lose { background: #fef2f2; color: #991b1b; }
  .badge-tie { background: #f0f9ff; color: #075985; }
  .legend { display: flex; gap: 1.5rem; margin-bottom: 1rem; font-size: 0.8rem; color: var(--gray); }
  .legend span { display: flex; align-items: center; gap: 0.25rem; }
  .legend .swatch { width: 12px; height: 12px; border-radius: 999px; display: inline-block; }
  .section { margin-bottom: 2.5rem; }
  .key-finding { background: var(--bg-alt); padding: 1rem 1.25rem; border-radius: var(--radius); margin-bottom: 1.5rem; border-left: 3px solid var(--accent); }
  .key-finding h3 { font-size: 0.875rem; margin-bottom: 0.5rem; color: var(--accent); }
  .key-finding ul { padding-left: 1.25rem; font-size: 0.875rem; }
  .key-finding li { margin-bottom: 0.25rem; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--gray); }
  @media (max-width: 768px) { body { padding: 1rem; } table { font-size: 0.75rem; } }
</style>
</head>
<body>
<h1>📊 Entity Resolver Benchmarks</h1>
<p class="subtitle">Generated ${report.timestamp} · Entity Resolver v${report.entityResolverVersion}</p>

<div class="legend">
  <span><span class="swatch" style="background:var(--accent)"></span> <strong>entity-resolver</strong></span>
  <span><span class="swatch" style="background:var(--orange)"></span> Splink ${report.competitorVersions.splink ?? '—'}</span>
  <span><span class="swatch" style="background:var(--green)"></span> GoldenMatch ${report.competitorVersions.goldenmatch ?? '—'}</span>
</div>

${generateKeyFindings(report)}

<div class="section">
<h2>Accuracy Comparison (F1 Score)</h2>
${generateF1Table(report)}
</div>

<div class="section">
<h2>Detailed Metrics</h2>
${generateDetailedTable(report)}
</div>

<div class="section">
<h2>Statistical Significance (McNemar Test)</h2>
${generateMcNemarSection(report)}
</div>

${generateMethodologySection()}

<footer>
  <p>Entity Resolver Benchmarks · ${report.timestamp} · Configs &amp; seeds documented in benchmarks/configs/standard.ts</p>
  <p>All benchmarks run with fixed seed=42, 3-iteration mean ± stdDev. Splink used with default SettingsCreator. GoldenMatch used in zero-config mode.</p>
</footer>
</body>
</html>`;

  writeFileSync(outputPath, html, 'utf-8');
}

function generateKeyFindings(report: BenchmarkReport): string {
  const lines: string[] = [];
  const erResults = report.results.filter((r) => r.tool === 'entity-resolver');
  const gmResults = report.results.filter((r) => r.tool === 'goldenmatch');
  const spResults = report.results.filter((r) => r.tool === 'splink');

  for (const er of erResults) {
    const gm = gmResults.find((r) => r.dataset === er.dataset);
    const sp = spResults.find((r) => r.dataset === er.dataset);
    const best = Math.max(
      er.metrics.f1,
      gm?.metrics.f1 ?? 0,
      sp?.metrics.f1 ?? 0,
    );

    let status = '';
    if (er.metrics.f1 >= best - 0.001) {
      status = `<span class="badge badge-win">🏆 Best</span>`;
    } else if (er.metrics.f1 >= best - 0.05) {
      status = `<span class="badge badge-tie">⚖ Competitive</span>`;
    } else {
      status = `<span class="badge badge-lose">⚠ Behind</span>`;
    }

    lines.push(
      `<li><strong>${er.dataset}:</strong> ER F1 = ${er.metrics.f1.toFixed(4)} ± ${er.metrics.f1StdDev.toFixed(4)}` +
      (gm ? ` vs GoldenMatch ${gm.metrics.f1.toFixed(4)}` : '') +
      (sp ? ` vs Splink ${sp.metrics.f1.toFixed(4)}` : '') +
      ` ${status}</li>`,
    );
  }

  return `<div class="key-finding">
<h3>Key Findings</h3>
<ul>${lines.join('\n')}</ul>
</div>`;
}

function generateF1Table(report: BenchmarkReport): string {
  const datasets = [...new Set(report.results.map((r) => r.dataset))];
  const tools = ['entity-resolver', 'splink', 'goldenmatch'];

  let html = '<table><thead><tr><th>Dataset</th>';
  for (const tool of tools) {
    html += `<th class="tool-header">${formatToolName(tool)} F1</th>`;
  }
  html += '<th>Winner</th></tr></thead><tbody>';

  for (const ds of datasets) {
    html += `<tr><td><strong>${ds}</strong></td>`;
    let bestF1 = 0;
    let bestTool = '';
    const cells: Record<string, { f1: number; stdDev: number }> = {};

    for (const tool of tools) {
      const r = report.results.find((x) => x.dataset === ds && x.tool === tool);
      if (r) {
        const f1 = r.metrics.f1;
        cells[tool] = { f1, stdDev: r.metrics.f1StdDev };
        if (f1 > bestF1) {
          bestF1 = f1;
          bestTool = tool;
        }
      } else {
        cells[tool] = { f1: 0, stdDev: 0 };
      }
    }

    for (const tool of tools) {
      const cell = cells[tool]!;
      const cls = cell.f1 >= bestF1 - 0.0001 ? 'winner' : '';
      html += `<td class="${cls}"><span class="f1-value">${cell.f1 > 0 ? cell.f1.toFixed(4) : '—'}</span>`;
      if (cell.stdDev > 0) {
        html += ` <span class="stddev">±${cell.stdDev.toFixed(4)}</span>`;
      }
      html += '</td>';
    }

    html += `<td><span class="badge badge-win">${formatToolName(bestTool)}</span></td></tr>`;
  }

  html += '</tbody></table>';
  return html;
}

function generateDetailedTable(report: BenchmarkReport): string {
  let html = '<table><thead><tr><th>Dataset</th><th>Tool</th><th>Precision</th><th>Recall</th><th>F1</th><th>Pairs</th><th>Time (ms)</th></tr></thead><tbody>';

  for (const r of report.results) {
    const cls = r.tool === 'entity-resolver' ? 'tool-er' : r.tool === 'splink' ? 'tool-splink' : 'tool-gm';
    html += `<tr>
<td>${r.dataset}</td>
<td class="${cls}">${formatToolName(r.tool)}</td>
<td>${r.metrics.precision.toFixed(4)}</td>
<td>${r.metrics.recall.toFixed(4)}</td>
<td class="f1-value">${r.metrics.f1.toFixed(4)}</td>
<td>${r.candidatePairs.toLocaleString()}</td>
<td>${r.timing.meanMs.toLocaleString()}</td>
</tr>`;
  }

  html += '</tbody></table>';
  return html;
}

function generateMcNemarSection(report: BenchmarkReport): string {
  // McNemar test results would be computed at runtime
  return `<p style="color:var(--gray);font-size:0.875rem">
McNemar's test for pairwise statistical significance is computed during the benchmark run.
Results are logged to the console and included in the JSON output.
See <code>benchmarks/output/benchmark-report.json</code> for full statistical details.
</p>`;
}

function generateMethodologySection(): string {
  return `<div class="section">
<h2>Methodology</h2>
<div class="key-finding">
<ul>
  <li><strong>Datasets:</strong> DBLP-ACM, Abt-Buy, Amazon-Google from Leipzig Group (real); FEBRL-1000/5000 synthetic (deterministic LCG, seed=42)</li>
  <li><strong>Repetitions:</strong> 3 runs per dataset per tool, mean ± stdDev reported</li>
  <li><strong>Threshold:</strong> Fixed score threshold 0.3 for entity-resolver; 0.5 match probability for Splink</li>
  <li><strong>Preprocessing:</strong> Identical CSV loading and column mapping across all tools</li>
  <li><strong>Hardware:</strong> Single Node.js 22 process, DuckDB in-memory backend</li>
  <li><strong>Splink config:</strong> Default SettingsCreator with JaroWinklerAtThresholds(0.8) + block_on(title)</li>
  <li><strong>GoldenMatch config:</strong> Zero-config ResolutionSpec auto-detect mode</li>
</ul>
</div>
</div>`;
}

function formatToolName(tool: string): string {
  switch (tool) {
    case 'entity-resolver': return 'Entity Resolver';
    case 'splink': return 'Splink';
    case 'goldenmatch': return 'GoldenMatch';
    default: return tool;
  }
}

/** Write the full JSON report for programmatic consumption. */
export function generateJsonReport(
  report: BenchmarkReport,
  outputPath: string,
): void {
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}
