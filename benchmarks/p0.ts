// P0: JS pipeline with real ensemble scorer on DBLP-ACM
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CSV_HELPER = '/tmp/load_csv.py';
writeFileSync(CSV_HELPER, 'import pandas as pd,json,sys\npath=sys.argv[1]\nd=pd.read_csv(path,encoding="latin1",dtype=str).fillna("")\nrecs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]\nprint(json.dumps(recs))\n');

function load(p: string): any[] {
  return JSON.parse(execSync(`python3 ${CSV_HELPER} ${p}`, { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024 }).trim());
}

async function main() {
  const core = await import('../packages/entity-resolver-core/dist/index.js');
  const { runPipeline } = core;

  const B = '/workspace/entity-resolver/benchmarks/datasets/DBLP-ACM';
  const left: any[] = load(`${B}/DBLP2.csv`);
  const right: any[] = load(`${B}/ACM.csv`);
  const truthRaw = readFileSync(`${B}/DBLP-ACM_perfectMapping.csv`, 'utf-8');
  const truth = new Set<string>();
  for (const line of truthRaw.trim().split('\n').slice(1)) {
    const p = line.split(',').map((s: string) => s.trim().replace(/"/g, ''));
    if (p[0] && p[1]) truth.add(`${p[0]}|${p[1]}`);
  }

  const lIds = left.map((r: any) => String(r.id ?? ''));
  const rIds = right.map((r: any) => String(r.id ?? ''));

  const config: any = {
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

  console.log('=== JS Pipeline + Ensemble (max-of-three) on DBLP-ACM ===\n');
  const RUNS = 3;
  const metrics: any[] = [];

  for (let run = 0; run < RUNS; run++) {
    process.stdout.write(`  Run ${run + 1}/${RUNS}...`);
    const t0 = performance.now();
    const result: any = await runPipeline([...left, ...right], config);
    const elapsed = performance.now() - t0;
    const pairs: any[] = result.scoredPairs ?? [];
    const filtered = pairs
      .filter((p: any) => p.leftId < left.length && p.rightId >= left.length)
      .map((p: any) => ({ leftId: p.leftId, rightId: p.rightId - left.length, score: p.score, probability: p.probability }));

    const pred = new Set<string>();
    for (const p of filtered) {
      if ((p.probability ?? p.score) >= 0.3) pred.add(`${lIds[p.leftId]}|${rIds[p.rightId]}`);
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

  const avgF1 = metrics.reduce((s, v) => s + v.f1, 0) / metrics.length;
  const avgT = Math.round(metrics.reduce((s, v) => s + v.timeMs, 0) / metrics.length);
  const old = 0.884;
  console.log('\n═══════════════════════════════════════════════');
  console.log('  SQL jaro_winkler (before):  F1=' + old.toFixed(4));
  console.log('  JS ensemble (after):        F1=' + avgF1.toFixed(4) + '  \u0394=' + ((avgF1 - old) >= 0 ? '+' : '') + (avgF1 - old).toFixed(4));
  console.log('  Time: ' + avgT + 'ms (SQL was ~200ms)');
  console.log('  Gap to GoldenMatch 0.9641:  ' + (0.9641 - avgF1).toFixed(4));
  console.log('═══════════════════════════════════════════════');
}
main();
