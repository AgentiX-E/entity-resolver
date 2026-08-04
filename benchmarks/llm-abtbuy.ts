// P1: Full-scope LLM-enhanced Abt-Buy benchmark
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API_KEY = 'sk-c0b33fe973ac4f599b6e2e3a2125a5b0';

async function main() {
  const core = await import('../packages/entity-resolver-core/dist/index.js');
  const { NodeDuckDBBackend } = await import('../packages/entity-resolver-node/dist/duckdb-backend.js');
  const { runPipeline } = core;

  const B = '/workspace/entity-resolver/benchmarks/datasets/Abt-Buy';
  execSync('python3 /tmp/load_rec.py ' + B + '/Abt.csv', {encoding:'utf-8', maxBuffer:200*1024*1024});

  // Use JS pipeline for broader candidate generation
  const abt = JSON.parse(execSync('python3 /tmp/load_rec.py ' + B + '/Abt.csv', {encoding:'utf-8',maxBuffer:200*1024*1024}).trim()) as Record<string,unknown>[];
  const buy = JSON.parse(execSync('python3 /tmp/load_rec.py ' + B + '/Buy.csv', {encoding:'utf-8',maxBuffer:200*1024*1024}).trim()) as Record<string,unknown>[];

  // Preserve IDs for truth matching
  for (let i=0; i<abt.length; i++) (abt[i] as any).id = String(abt[i].id ?? i);
  for (let i=0; i<buy.length; i++) (buy[i] as any).id = String(buy[i].id ?? i + abt.length);

  const truth = new Set<string>();
  for (const line of readFileSync(B + '/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)) {
    const [l,r] = line.split(',').map(s=>s.trim().replace(/"/g,''));
    if (l&&r) truth.add(l+'|'+r);
  }

  const all = [...abt, ...buy];
  console.log('Abt-Buy: ' + abt.length + '+' + buy.length + ' records, ' + truth.size + ' truth pairs\n');

  // Run JS pipeline with broad blocking to get candidates
  const config = {
    comparisons: [
      {field:'name',scorerName:'jaro_winkler',levels:[
        {label:'strong_match',threshold:.95},{label:'moderate_match',threshold:.7},{label:'weak_match',threshold:.4}
      ]},
      {field:'price',scorerName:'exact',levels:[{label:'match',isExact:true}]},
    ],
    blocking: {passes:[{fields:['name'],transforms:['lowercase']},{fields:['name'],transforms:['soundex']}]},
    matchThreshold: 0.3,
    llmRerank: {
      apiKey: API_KEY,
      provider: 'deepseek' as const,
      topK: 20,
      minCandidateScore: 0.3,
    },
  };

  console.log('Running JS pipeline with LLM re-rank...');
  const t0 = performance.now();
  const result = await runPipeline(all, config);
  const elapsed = performance.now() - t0;

  // Filter cross-source pairs
  const pairs = (result.scoredPairs ?? [])
    .filter((p:any) => p.leftId < abt.length && p.rightId >= abt.length)
    .map((p:any) => ({leftId:p.leftId, rightId:p.rightId - abt.length, score:p.score, probability:p.probability}));

  // Compute F1
  const pred = new Set<string>();
  for (const p of pairs) {
    if ((p.probability ?? p.score) >= 0.3) {
      pred.add(abt[p.leftId].id + '|' + buy[p.rightId].id);
    }
  }
  let tp=0; for (const p of pred) if (truth.has(p)) tp++;
  const f1 = tp>0?(2*tp)/(2*tp+(pred.size-tp)+(truth.size-tp)):0;
  const precision = pred.size>0?tp/pred.size:0;
  const recall = truth.size>0?tp/truth.size:0;

  console.log('\nResults:');
  console.log('F1=' + f1.toFixed(4) + ' P=' + precision.toFixed(4) + ' R=' + recall.toFixed(4));
  console.log('Scored pairs: ' + pairs.length + ' Time: ' + (elapsed/1000).toFixed(1) + 's');
  console.log('TP=' + tp + ' FP=' + (pred.size-tp) + ' FN=' + (truth.size-tp));
}
main();
