// P0: JS pipeline with real ensemble scorer on DBLP-ACM
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

async function main() {
  const core = await import('../../packages/entity-resolver-core/dist/index.js');
  const { runPipeline } = core;

  function loadCsv(path: string): Array<Record<string, string>> {
    const code = `import pandas as pd,json; d=pd.read_csv(r'${path}',encoding='latin1',dtype=str).fillna(''); recs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]; print(json.dumps(recs))`;
    return JSON.parse(execSync(`python3 -c '${code}'`, { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024 }).trim());
  }

  const BASE = '/workspace/entity-resolver/benchmarks/datasets/DBLP-ACM';
  const left = loadCsv(`${BASE}/DBLP2.csv`);
  const right = loadCsv(`${BASE}/ACM.csv`);
  const truthRaw = readFileSync(`${BASE}/DBLP-ACM_perfectMapping.csv`, 'utf-8');
  const truth = new Set<string>();
  for (const line of truthRaw.trim().split('\n').slice(1)) {
    const parts = line.split(',').map((s) => s.trim().replace(/"/g, ''));
    if (parts[0] && parts[1]) truth.add(`${parts[0]}|${parts[1]}`);
  }

  const leftIds = left.map((r) => String(r.id ?? ''));
  const rightIds = right.map((r) => String(r.id ?? ''));
  const all = [...left, ...right];

  const config = {
    comparisons: [
      { field: 'title', scorerName: 'ensemble', levels: [
        { label: 'strong_match', threshold: 0.95 },
        { label: 'moderate_match', threshold: 0.8 },
        { label: 'weak_match', threshold: 0.6 },
      ]},
      { field: 'year', scorerName: 'exact', levels: [{ label: 'match', isExact: true }] },
    ],
    blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }] },
    matchThreshold: 0.3,
  };

  console.log('=== JS Pipeline with Ensemble (max-of-three) on DBLP-ACM ===\n');
  const RUNS = 3;
  const metrics: any[] = [];

  for (let run = 0; run < RUNS; run++) {
    process.stdout.write(`  Run ${run + 1}/${RUNS}...`);
    const t0 = performance.now();
    const result = await runPipeline(all, config);
    const elapsed = performance.now() - t0;
    const pairs = result.scoredPairs ?? [];

    const filtered = pairs
      .filter((p: any) => p.leftId < left.length && p.rightId >= left.length)
      .map((p: any) => ({ leftId: p.leftId, rightId: p.rightId - left.length, score: p.score, probability: p.probability }));

    const pred = new Set<string>();
    for (const p of filtered) {
      if ((p.probability ?? p.score) >= 0.3) pred.add(`${leftIds[p.leftId]}|${rightIds[p.rightId]}`);
    }
    let tp = 0;
    for (const p of pred) { if (truth.has(p)) tp++; }
    const fp = pred.size - tp, fn = truth.size - tp;
    const precision = pred.size > 0 ? tp / pred.size : 0;
    const recall = truth.size > 0 ? tp / truth.size : 0;
    const f1 = tp > 0 ? (2 * tp) / (2 * tp + fp + fn) : 0;

    metrics.push({ f1, precision, recall, pairs: filtered.length, timeMs: Math.round(elapsed) });
    console.log(` F1=${f1.toFixed(4)} P=${precision.toFixed(4)} R=${recall.toFixed(4)} pairs=${filtered.length} time=${(elapsed / 1000).toFixed(1)}s`);
  }

  const avgF1 = metrics.reduce((s, m) => s + m.f1, 0) / metrics.length;
  const avgTime = Math.round(metrics.reduce((s, m) => s + m.timeMs, 0) / metrics.length);
  const before = 0.8840;

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Before (SQL, jaro_winkler):  F1=${before.toFixed(4)}`);
  console.log(`  After  (JS, ensemble):       F1=${avgF1.toFixed(4)}  Δ=${(avgF1 - before) >= 0 ? '+' : ''}${(avgF1 - before).toFixed(4)}`);
  console.log(`  Time: ${avgTime}ms (SQL was ~200ms)`);
  console.log(`  Gap to GoldenMatch (0.9641): ${(0.9641 - avgF1).toFixed(4)}`);
  console.log('═══════════════════════════════════════════════');
}
main();
