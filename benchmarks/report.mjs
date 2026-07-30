/**
 * Benchmark Report Generator — produces HTML for GitHub Pages
 *
 * Reads benchmarks/output/results.json and generates an
 * interactive HTML comparison page.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const IN = resolve(import.meta.dirname || '.', 'output', 'results.json');
const OUT = resolve(import.meta.dirname || '.', 'output', 'index.html');

mkdirSync(resolve(import.meta.dirname || '.', 'output'), { recursive: true });

let data;
try {
  data = JSON.parse(readFileSync(IN, 'utf-8'));
} catch {
  data = { scale: 'N/A', timestamp: new Date().toISOString(), results: [] };
}

const results = data.results || [];
const erResult = results.find(r => r.engine === 'entity-resolver-sql');
const cmpResults = results.filter(r => r.engine !== 'entity-resolver-sql');

const rows = results.map(r => {
  const name = r.engine === 'entity-resolver-sql' ? '<b>entity-resolver</b>' : r.engine;
  const time = r.error ? `<span style="color:#dc2626">ERR</span>` : r.timeSec + 's';
  const pairs = r.pairs ?? 'N/A';
  const tput = r.throughput ? r.throughput.toLocaleString() + ' rec/s' : 'N/A';
  const mode = r.mode || r.version || '';
  return `<tr><td>${name}</td><td>${time}</td><td>${pairs}</td><td>${tput}</td><td style="font-size:12px;color:#6b7280">${mode}</td></tr>`;
}).join('\n');

const winner = erResult && cmpResults.length > 0
  ? (erResult.throughput > (cmpResults[0]?.throughput || 0) ? 'entity-resolver' : cmpResults[0]?.engine)
  : 'N/A';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>entity-resolver Benchmark — ${data.scale}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;background:#fafafa;color:#1f2937}
h1{font-size:24px;border-bottom:2px solid #3b82f6;padding-bottom:8px}
h2{font-size:18px;margin-top:32px}
table{width:100%;border-collapse:collapse;margin:16px 0;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
th{background:#3b82f6;color:white;padding:10px 16px;text-align:left;font-size:14px}
td{padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:14px}
tr:last-child td{border-bottom:none}
tr:hover{background:#f0f7ff}
.meta{font-size:13px;color:#6b7280;margin-bottom:24px}
.winner{background:#16a34a;color:white;padding:12px 20px;border-radius:8px;margin:16px 0;font-weight:600}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}
.badge-er{background:#dbeafe;color:#1d4ed8}
.badge-splink{background:#fef3c7;color:#92400e}
footer{font-size:12px;color:#9ca3af;margin-top:48px;text-align:center}
</style>
</head>
<body>
<h1>⚡ entity-resolver Benchmark</h1>
<div class="meta">
  Scale: <span class="badge badge-er">${data.scale}</span>
  &nbsp; Timestamp: ${data.timestamp}
  &nbsp; Platform: Node.js + DuckDB</div>

<h2>Results</h2>
<table>
<thead><tr><th>Engine</th><th>Time</th><th>Pairs</th><th>Throughput</th><th>Configuration</th></tr></thead>
<tbody>${rows}</tbody>
</table>

${winner !== 'N/A' ? `<div class="winner">🏆 Fastest: ${winner}</div>` : ''}

<h2>Competitors Compared</h2>
<table>
<thead><tr><th>Tool</th><th>Language</th><th>Backend</th><th>Algorithm</th></tr></thead>
<tbody>
<tr><td><b>entity-resolver</b></td><td>TypeScript</td><td>DuckDB (Node)</td><td>Fellegi-Sunter EM + inline prefix filter</td></tr>
<tr><td>Splink</td><td>Python</td><td>DuckDB (Python)</td><td>Fellegi-Sunter EM + SQL blocking</td></tr>
<tr><td>recordlinkage (planned)</td><td>Python</td><td>Pandas/NumPy</td><td>Fellegi-Sunter + rule-based</td></tr>
<tr><td>dedupe (planned)</td><td>Python</td><td>SQLite</td><td>Active learning + logistic regression</td></tr>
</tbody>
</table>

<h2>Standard Datasets</h2>
<table>
<thead><tr><th>Dataset</th><th>Source</th><th>Records</th><th>Type</th><th>Status</th></tr></thead>
<tbody>
<tr><td>DBLP-ACM</td><td>Leipzig Group</td><td>2,616 × 2,294</td><td>Bibliographic</td><td>✅ Downloaded</td></tr>
<tr><td>DBLP-Scholar</td><td>Leipzig Group</td><td>2,616 × 64,263</td><td>Bibliographic</td><td>⬇ Pending</td></tr>
<tr><td>Amazon-Google</td><td>Leipzig Group</td><td>1,363 × 3,226</td><td>Product</td><td>⬇ Pending</td></tr>
<tr><td>Abt-Buy</td><td>Leipzig Group</td><td>1,081 × 1,092</td><td>Product</td><td>⬇ Pending</td></tr>
<tr><td>FEBRL</td><td>ANU</td><td>5,000 × 5,000</td><td>Census</td><td>✅ Generated</td></tr>
</tbody>
</table>

<footer>
  entity-resolver v0.1.0 &mdash; ${10} packages &mdash; 
  <a href="https://github.com/AgentiX-E/entity-resolver">GitHub</a>
</footer>
</body>
</html>`;

writeFileSync(OUT, html);
console.log(`Report generated: ${OUT}`);
