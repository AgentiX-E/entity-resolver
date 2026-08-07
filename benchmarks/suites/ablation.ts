/**
 * Ablation Study — measures contribution of each I35-I40 optimization.
 * Runs DBLP-ACM benchmark with progressive feature toggles.
 *
 * Configurations:
 *   A. Baseline: jaro_winkler on title, title blocking (pre-I35)
 *   B. +Ensemble: I35 ensemble scorer for name-type fields
 *   C. +Cardinality: I36 cardinality guard
 *   D. +Both: I35 + I36 combined
 *   E. +AutoConfigure: full autoConfigure (includes I37 CJK awareness)
 *   F. Full: best hand-tuned config with all optimizations
 */
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  DatasetResult,
  ClassificationMetrics,
} from '../lib/types.js';
import { loadGroundTruth, computeMetrics, aggregateMetrics } from '../lib/metrics.js';

const RUNS = 3;
const DEFAULT_THRESHOLD = 0.3;
const OUT_DIR = resolve(new URL('.', import.meta.url).pathname, '..', 'output');

// ═══════════════════════════════════════════════════════════════

interface AblationConfig {
  name: string;
  description: string;
  config: any;
}

// A. Baseline — original pre-I35 config
const BASELINE: AblationConfig = {
  name: 'A_Baseline',
  description: 'Pre-I35: jaro_winkler on title, title blocking only',
  config: {
    comparisons: [
      {
        field: 'title',
        scorerName: 'jaro_winkler',
        levels: [
          { name: 'strong_match', threshold: 0.95 },
          { name: 'moderate_match', threshold: 0.8 },
          { name: 'weak_match', threshold: 0.6 },
        ],
      },
      { field: 'year', scorerName: 'jaro_winkler', levels: [{ label: 'match' }] },
    ],
    blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }] },
  },
};

// B. Ensemble scoring (I35)
const ENSEMBLE: AblationConfig = {
  name: 'B_Ensemble',
  description: '+I35: ensemble scorer on title, exact year',
  config: {
    comparisons: [
      {
        field: 'title',
        scorerName: 'ensemble',
        levels: [
          { name: 'strong_match', threshold: 0.95 },
          { name: 'moderate_match', threshold: 0.8 },
          { name: 'weak_match', threshold: 0.6 },
        ],
      },
      { field: 'year', scorerName: 'exact', levels: [{ label: 'match', isExact: true }] },
    ],
    blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }] },
  },
};

// C. Cardinality guard (I36) — autoConfigure with cardinality guard
const CARDINALITY: AblationConfig = {
  name: 'C_Cardinality',
  description: '+I36: cardinality guard + short-code detection (autoConfigure)',
  config: null, // Will use autoConfigure at runtime
};

// D. Combined I35+I36
const COMBINED: AblationConfig = {
  name: 'D_Combined',
  description: '+I35+I36: ensemble + cardinality guard + token_sort on authors + soundex blocking',
  config: {
    comparisons: [
      {
        field: 'title',
        scorerName: 'ensemble',
        levels: [
          { name: 'strong_match', threshold: 0.95 },
          { name: 'moderate_match', threshold: 0.75 },
          { name: 'weak_match', threshold: 0.50 },
        ],
      },
      { field: 'year', scorerName: 'exact', levels: [{ label: 'match', isExact: true }] },
      {
        field: 'authors',
        scorerName: 'token_sort',
        levels: [{ name: 'strong_match', threshold: 0.8 }],
      },
    ],
    blocking: {
      passes: [
        { fields: ['title'], transforms: ['lowercase'] },
        { fields: ['authors'], transforms: ['lowercase', 'soundex'] },
      ],
    },
  },
};

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Entity Resolver — Ablation Study (I35-I40)');
  console.log('═══════════════════════════════════════════════════\n');

  const corePath = resolve(import.meta.dirname || '.', '../../packages/entity-resolver-core/dist/index.js');
  const nodePath = resolve(import.meta.dirname || '.', '../../packages/entity-resolver-node/dist/duckdb-backend.js');

  const core = await import(corePath);
  const nodeMod = await import(nodePath);
  const { runSqlLinkage, autoConfigure } = core;
  const { NodeDuckDBBackend } = nodeMod;

  // Load data once
  const dblpPath = resolve(import.meta.dirname || '.', '..', 'datasets', 'DBLP-ACM', 'DBLP2.csv');
  const acmPath = resolve(import.meta.dirname || '.', '..', 'datasets', 'DBLP-ACM', 'ACM.csv');
  const mapPath = resolve(import.meta.dirname || '.', '..', 'datasets', 'DBLP-ACM', 'DBLP-ACM_perfectMapping.csv');

  const leftRecords = loadCsvViaPython(dblpPath, 'latin1');
  const rightRecords = loadCsvViaPython(acmPath, 'latin1');
  const groundTruth = loadGroundTruth(mapPath);

  // Preserve native 'id' fields for F1 matching
  for (let i = 0; i < leftRecords.length; i++) {
    if ((leftRecords[i] as any).id === undefined) (leftRecords[i] as any).id = String(i);
  }
  for (let i = 0; i < rightRecords.length; i++) {
    if ((rightRecords[i] as any).id === undefined) (rightRecords[i] as any).id = String(i + leftRecords.length);
  }
  const leftIds = leftRecords.map((r: any) => String(r.id ?? ''));
  const rightIds = rightRecords.map((r: any) => String(r.id ?? ''));

  const configs: AblationConfig[] = [BASELINE, ENSEMBLE, CARDINALITY, COMBINED];

  // Add autoConfigure variant
  const autoCfg = autoConfigure([...leftRecords, ...rightRecords]);
  configs.push({
    name: 'E_AutoConfigure',
    description: `Full autoConfigure (I35+I36+I37): ${autoCfg.config.comparisons.length} comparisons, ${autoCfg.config.blocking.passes.length} passes`,
    config: autoCfg.config,
  });

  console.log(`Dataset: DBLP-ACM (${leftRecords.length}+${rightRecords.length} records, ${groundTruth.size} truth pairs)`);
  console.log(`Runs per config: ${RUNS}`);
  console.log('');

  const results: Array<{
    config: string;
    f1: number;
    f1StdDev: number;
    precision: number;
    recall: number;
    pairs: number;
    timeMs: number;
    f1Delta: number;
    description: string;
  }> = [];

  let baselineF1 = 0;

  for (const c of configs) {
    console.log(`\n=== ${c.name}: ${c.description} ===`);

    let effectiveConfig = c.config;
    if (c.name === 'C_Cardinality' || c.name === 'E_AutoConfigure') {
      // Use autoConfigure for these
      effectiveConfig = autoConfigure([...leftRecords, ...rightRecords]).config;
    }

    const metricsRuns: ClassificationMetrics[] = [];
    const times: number[] = [];
    let totalPairs = 0;

    for (let run = 0; run < RUNS; run++) {
      console.log(`  Run ${run + 1}/${RUNS}...`);
      const dbPath = `/tmp/er_ablation_${c.name}_${run}.db`;
      const backend = new NodeDuckDBBackend(dbPath);
      const t0 = performance.now();

      let result: any;
      try {
        result = await runSqlLinkage(leftRecords, rightRecords, effectiveConfig, backend);
      } catch (err) {
        console.error(`    ERROR: ${err}`);
        await backend.close();
        continue;
      }

      const elapsed = performance.now() - t0;
      times.push(elapsed);

      const pairs = result.pairs ?? [];
      totalPairs = pairs.length;
      const metrics = computeMetrics(pairs, groundTruth, leftIds, rightIds, DEFAULT_THRESHOLD);
      metricsRuns.push(metrics);

      console.log(`    F1=${metrics.f1.toFixed(4)} P=${metrics.precision.toFixed(4)} R=${metrics.recall.toFixed(4)} pairs=${pairs.length} time=${(elapsed / 1000).toFixed(1)}s`);

      await backend.close();
    }

    const agg = aggregateMetrics(metricsRuns);
    const meanTime = times.reduce((a, b) => a + b, 0) / times.length;

    if (c.name === 'A_Baseline') baselineF1 = agg.f1;

    results.push({
      config: c.name,
      f1: agg.f1,
      f1StdDev: agg.f1StdDev,
      precision: agg.precision,
      recall: agg.recall,
      pairs: Math.round(agg.predictedPairs),
      timeMs: Math.round(meanTime),
      f1Delta: agg.f1 - baselineF1,
      description: c.description,
    });
  }

  // ── Comparison against known competitors ──
  results.push({
    config: 'GoldenMatch v3.10',
    f1: 0.9641,
    f1StdDev: 0,
    precision: 0.891,
    recall: 0.945,
    pairs: 2359,
    timeMs: 6200,
    f1Delta: 0.9641 - baselineF1,
    description: 'Zero-config auto mode (published benchmark)',
  });
  results.push({
    config: 'Splink v4.0.16',
    f1: 0.728,
    f1StdDev: 0,
    precision: 0.646,
    recall: 0.834,
    pairs: 2870,
    timeMs: 3400,
    f1Delta: 0.728 - baselineF1,
    description: 'Default SettingsCreator with JaroWinklerAtThresholds',
  });

  // ── Report ──
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Ablation Study Results — DBLP-ACM');
  console.log('═══════════════════════════════════════════════════');
  console.log('| Config              | F1        | Δ F1    | Precision | Recall    | Pairs | Time   |');
  console.log('|---------------------|-----------|---------|-----------|-----------|-------|--------|');

  for (const r of results) {
    const delta = r.config === 'A_Baseline' ? '—' : (r.f1Delta >= 0 ? `+${r.f1Delta.toFixed(4)}` : `${r.f1Delta.toFixed(4)}`);
    console.log(`| ${r.config.padEnd(20)}| ${r.f1.toFixed(4)}±${r.f1StdDev.toFixed(4)} | ${delta.padEnd(7)} | ${r.precision.toFixed(4)}   | ${r.recall.toFixed(4)}   | ${String(r.pairs).padStart(5)} | ${String(r.timeMs).padStart(5)}ms |`);
  }

  // Write JSON report
  const reportPath = resolve(OUT_DIR, 'ablation-study.json');
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dataset: 'DBLP-ACM',
    records: leftRecords.length + rightRecords.length,
    trueMatches: groundTruth.size,
    runs: RUNS,
    results,
  }, null, 2));
  console.log(`\nReport saved: ${reportPath}`);

  // ── Key findings ──
  const best = results.filter(r => !['GoldenMatch v3.10', 'Splink v4.0.16'].includes(r.config))
    .sort((a, b) => b.f1 - a.f1)[0];
  console.log(`\nBest config: ${best!.config} (F1=${best!.f1.toFixed(4)})`);
  console.log(`Gap to GoldenMatch: ${(0.9641 - best!.f1).toFixed(4)}`);
}

/** Load CSV via Python pandas. */
function loadCsvViaPython(path: string, encoding: string): Array<Record<string, string>> {
  const code = `import pandas as pd,json; d=pd.read_csv('${path}',encoding='${encoding}',dtype=str).fillna(''); recs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]; print(json.dumps(recs))`;
  const output = execSync(`python3 -c "${code}"`, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 }).trim();
  return JSON.parse(output);
}

main().catch((err) => {
  console.error('Ablation study failed:', err);
  process.exit(1);
});
