/**
 * Unified Benchmark Runner — I31
 *
 * Runs entity-resolver accuracy benchmarks on 5 standard ER datasets,
 * compares against Splink 4.x and GoldenMatch 3.x, and produces
 * an HTML report + JSON data for GitHub Pages.
 *
 * Usage:
 *   node --import tsx benchmarks/run.ts
 *
 * All paths are repo-relative (resolve from import.meta.url).
 * Results are written to benchmarks/output/.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BenchmarkReport, ComparisonMatrix, ComparisonCell } from './lib/types.js';
import { generateHtmlReport, generateJsonReport } from './lib/reporter.js';
import { runEntityResolverAccuracyBenchmarks } from './suites/accuracy.js';
import { runSplinkBenchmarks, runGoldenMatchBenchmarks } from './suites/competitors.js';

const OUTPUT_DIR = resolve(
  new URL('.', import.meta.url).pathname,
  'output',
);
const ENTITY_RESOLVER_VERSION = '0.1.0-beta'; // TODO: read from package.json

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════════');
  console.log('  Entity Resolver — Unified Benchmark Suite (I31)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Version:   ${ENTITY_RESOLVER_VERSION}`);
  console.log(`  Runs:      3 per dataset (mean ± stdDev)`);
  console.log(`  Seed:      42`);
  console.log('═══════════════════════════════════════════════════\n');

  // ── Entity Resolver accuracy benchmarks ──
  console.log('▶ Phase 1/3: Entity Resolver Accuracy');
  const erResults = await runEntityResolverAccuracyBenchmarks(ENTITY_RESOLVER_VERSION);

  // ── Splink comparison ──
  console.log('\n▶ Phase 2/3: Splink 4.x Comparison');
  const splinkResults = runSplinkBenchmarks();

  // ── GoldenMatch comparison ──
  console.log('\n▶ Phase 3/3: GoldenMatch 3.x Comparison');
  const goldenmatchResults = runGoldenMatchBenchmarks();

  // ── Build comparison matrix ──
  const allResults = [...erResults, ...splinkResults, ...goldenmatchResults];
  const datasets = [...new Set(allResults.map((r) => r.dataset))];
  const tools = [...new Set(allResults.map((r) => r.tool))];

  const matrix: ComparisonMatrix = {
    datasets,
    tools,
    rows: {},
  };

  for (const ds of datasets) {
    matrix.rows[ds] = {};
    for (const tool of tools) {
      const result = allResults.find((r) => r.dataset === ds && r.tool === tool);
      if (result) {
        const cell: ComparisonCell = {
          f1: result.metrics.f1,
          f1StdDev: result.metrics.f1StdDev,
          precision: result.metrics.precision,
          recall: result.metrics.recall,
          timeMeanMs: result.timing.meanMs,
        };
        matrix.rows[ds]![tool] = cell;
      }
    }
  }

  // ── Build report ──
  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    entityResolverVersion: ENTITY_RESOLVER_VERSION,
    competitorVersions: {
      splink: splinkResults[0]?.toolVersion ?? 'unknown',
      goldenmatch: goldenmatchResults[0]?.toolVersion ?? 'unknown',
    },
    results: allResults,
    comparisonMatrix: matrix,
  };

  // ── Write outputs ──
  const jsonPath = resolve(OUTPUT_DIR, 'benchmark-report.json');
  const htmlPath = resolve(OUTPUT_DIR, 'benchmark-report.html');
  const csvPath = resolve(OUTPUT_DIR, 'benchmark-matrix.csv');

  generateJsonReport(report, jsonPath);
  generateHtmlReport(report, htmlPath);
  writeCsvReport(report, csvPath);

  // ── Console summary ──
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Benchmark Complete');
  console.log('═══════════════════════════════════════════════════');
  console.log('| Dataset          | ER F1        | Splink F1    | GoldenMatch F1 | Winner        |');
  console.log('|------------------|--------------|--------------|----------------|---------------|');

  for (const ds of datasets) {
    const er = erResults.find((r) => r.dataset === ds);
    const sp = splinkResults.find((r) => r.dataset === ds);
    const gm = goldenmatchResults.find((r) => r.dataset === ds);

    const erF1 = er ? `${er.metrics.f1.toFixed(4)}±${er.metrics.f1StdDev.toFixed(4)}` : '—';
    const spF1 = sp ? sp.metrics.f1.toFixed(4) : '—';
    const gmF1 = gm ? gm.metrics.f1.toFixed(4) : '—';

    const best = Math.max(
      er?.metrics.f1 ?? 0,
      sp?.metrics.f1 ?? 0,
      gm?.metrics.f1 ?? 0,
    );
    let winner = '—';
    if (er && er.metrics.f1 >= best - 0.0001) winner = 'Entity Resolver 🏆';
    else if (gm && gm.metrics.f1 >= best - 0.0001) winner = 'GoldenMatch 🏆';
    else if (sp && sp.metrics.f1 >= best - 0.0001) winner = 'Splink 🏆';

    const dsPad = ds.padEnd(16);
    const erPad = erF1.padEnd(12);
    const spPad = spF1.padEnd(12);
    const gmPad = gmF1.padEnd(14);

    console.log(`| ${dsPad} | ${erPad} | ${spPad} | ${gmPad} | ${winner.padEnd(13)} |`);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log(`\nReports saved to:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  HTML: ${htmlPath}`);
  console.log(`  CSV:  ${csvPath}`);
}

/** Generate a CSV summary for spreadsheet import. */
function writeCsvReport(report: BenchmarkReport, path: string): void {
  const lines: string[] = ['dataset,tool,precision,recall,f1,f1_stddev,time_mean_ms,pairs'];
  for (const r of report.results) {
    lines.push(
      `${r.dataset},${r.tool},${r.metrics.precision},${r.metrics.recall},${r.metrics.f1},${r.metrics.f1StdDev},${r.timing.meanMs},${r.candidatePairs}`,
    );
  }
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
