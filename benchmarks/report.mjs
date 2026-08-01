/**
 * Benchmark Report Generator — dynamic HTML for GitHub Pages.
 * Reads synthetic performance + real dataset accuracy results.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const DIR = resolve(import.meta.dirname || '.', 'output');
const OUT = resolve(DIR, 'index.html');
mkdirSync(DIR, { recursive: true });

function load(path) { try { return JSON.parse(readFileSync(resolve(DIR, path), 'utf-8')); } catch { return null; } }

const perfData = load('results.json') || load('staged-full.json');
const accData = load('comparison-results.json');

// ─── Synthetic performance table ────────────────────────────────
let perfRows = '';
if (perfData && perfData.results) {
  perfRows = perfData.results.filter(function(r) { return r.engine === 'entity-resolver-sql'; }).map(function(r) {
    return '<tr><td>' + r.scale + '</td><td>' + r.records + '</td><td>' + r.timeSec + 's</td><td>' + r.pairs + '</td><td>' + (r.throughput ? r.throughput.toLocaleString() + ' rec/s' : 'N/A') + '</td></tr>';
  }).join('\n');
}

// ─── Accuracy table ─────────────────────────────────────────────
let accRows = '';
const erAcc = (accData && accData.entityResolver) || [];
const splinkAcc = (accData && accData.splink) || [];
erAcc.forEach(function(r) {
  var sp = splinkAcc.find(function(s) { return s.dataset === r.dataset; });
  var spF1 = sp ? sp.f1.toFixed(4) : 'N/A';
  var best = r.f1 > (sp ? sp.f1 : 0) ? 'badge-er' : 'badge-splink';
  accRows += '<tr><td>' + r.dataset + '</td><td>' + r.mode + '</td><td>' + r.records + '</td><td>' + r.trueMatches + '</td>';
  accRows += '<td><span class="badge ' + best + '">' + r.f1.toFixed(4) + '</span></td>';
  accRows += '<td>' + r.precision.toFixed(4) + '</td><td>' + r.recall.toFixed(4) + '</td><td>' + r.pairs + '</td><td>' + r.timeSec + 's</td><td>' + spF1 + '</td></tr>';
});

var accSection = erAcc.length > 0
  ? '<h2>Real Dataset Accuracy (F1 — Ground Truth)</h2><table><thead><tr><th>Dataset</th><th>Mode</th><th>Records</th><th>True</th><th>F1</th><th>P</th><th>R</th><th>Pairs</th><th>Time</th><th>Splink F1</th></tr></thead><tbody>' + accRows + '</tbody></table>'
  : '<p style="color:#9ca3af">Accuracy data: run <code>node benchmarks/comparison.mjs</code></p>';

var perfSection = perfRows
  ? '<h2>Synthetic Performance (20% dup, 2-field jaro_winkler)</h2><table><thead><tr><th>Scale</th><th>Records</th><th>Time</th><th>Pairs</th><th>Throughput</th></tr></thead><tbody>' + perfRows + '</tbody></table>'
  : '';

var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>entity-resolver Benchmarks</title>\n<style>\nbody{font-family:system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;background:#fafafa;color:#1f2937}\nh1{font-size:24px;border-bottom:2px solid #3b82f6;padding-bottom:8px}\nh2{font-size:18px;margin-top:32px}\ntable{width:100%;border-collapse:collapse;margin:16px 0;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}\nth{background:#3b82f6;color:white;padding:10px 12px;text-align:left;font-size:13px}\ntd{padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;font-variant-numeric:tabular-nums}\n.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}\n.badge-er{background:#dbeafe;color:#1d4ed8}\n.badge-splink{background:#fef3c7;color:#92400e}\n.meta{font-size:13px;color:#6b7280;margin-bottom:24px}\nfooter{font-size:12px;color:#9ca3af;margin-top:48px;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px}\n</style>\n</head>\n<body>\n<h1>entity-resolver Benchmarks</h1>\n<div class="meta">Generated: ' + new Date().toISOString() + ' &mdash; <a href="https://github.com/AgentiX-E/entity-resolver">GitHub</a></div>\n' + perfSection + '\n' + accSection + '\n<footer>entity-resolver &mdash; 10 packages &mdash; MIT License</footer>\n</body>\n</html>';

writeFileSync(OUT, html);
console.log('Report generated: ' + OUT);
