// LLM-enhanced product matching benchmark — Abt-Buy + Amazon-Google
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

writeFileSync('/tmp/load_records.py', 'import pandas as pd,json,sys\nd=pd.read_csv(sys.argv[1],encoding="latin1",dtype=str).fillna("")\nprint(json.dumps([{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]))\n');

function load(p: string): any[] {
  return JSON.parse(execSync('python3 /tmp/load_records.py ' + p, {encoding:'utf-8', maxBuffer:200*1024*1024}).trim());
}

async function main() {
  const core = await import('../packages/entity-resolver-core/dist/index.js');
  const { NodeDuckDBBackend } = await import('../packages/entity-resolver-node/dist/duckdb-backend.js');
  const { runSqlLinkage } = core;

  const API_KEY = 'sk-c0b33fe973ac4f599b6e2e3a2125a5b0';
  const base = '/workspace/entity-resolver/benchmarks/datasets';

  const benchmarks = [
    {
      name: 'Abt-Buy',
      left: 'Abt-Buy/Abt.csv', right: 'Abt-Buy/Buy.csv', truth: 'Abt-Buy/abt_buy_perfectMapping.csv',
      config: {
        comparisons: [
          {field:'name',scorerName:'jaro_winkler',levels:[{label:'strong',threshold:.95},{label:'moderate',threshold:.7},{label:'weak',threshold:.4}]},
        ],
        blocking: {passes:[{fields:['name'],transforms:['lowercase']},{fields:['name'],transforms:['soundex']}]},
        matchThreshold: 0.3,
        llmRerank: {
          apiKey: API_KEY, provider: 'deepseek' as const, topK: 30,
          minCandidateScore: 0.3, candidateLo: 0.3, candidateHi: 0.8,
        },
      },
    },
    {
      name: 'Amazon-Google',
      left: 'Amazon-Google/Amazon.csv', right: 'Amazon-Google/GoogleProducts.csv', truth: 'Amazon-Google/Amzon_GoogleProducts_perfectMapping.csv',
      config: {
        comparisons: [
          {field:'title',scorerName:'jaro_winkler',levels:[{label:'strong',threshold:.95},{label:'moderate',threshold:.8},{label:'weak',threshold:.6}]},
        ],
        blocking: {passes:[{fields:['title'],transforms:['lowercase']}]},
        matchThreshold: 0.3,
        llmRerank: {
          apiKey: API_KEY, provider: 'deepseek' as const, topK: 20,
          minCandidateScore: 0.3, candidateLo: 0.3, candidateHi: 0.8,
        },
      },
    },
  ];

  console.log('=== LLM-Enhanced Product Matching Benchmark ===\n');

  for (const bm of benchmarks) {
    const left = load(base + '/' + bm.left);
    const right = load(base + '/' + bm.right);
    for (let i=0; i<left.length; i++) if (!(left[i]as any).id) (left[i]as any).id = String(i);
    for (let i=0; i<right.length; i++) if (!(right[i]as any).id) (right[i]as any).id = String(i+left.length);
    const lIds = left.map((r:any)=>String(r.id??''));
    const rIds = right.map((r:any)=>String(r.id??''));

    const truth = new Set<string>();
    try {
      for (const line of readFileSync(base+'/'+bm.truth,'utf-8').trim().split('\n').slice(1)) {
        const [l,r] = line.split(',').map((s:string)=>s.trim().replace(/"/g,''));
        if (l&&r) truth.add(l+'|'+r);
      }
    } catch(e) { console.log('Truth error:', (e as Error).message.slice(0,50)); continue; }

    console.log(`${bm.name} (${left.length}+${right.length} records, ${truth.size} truth pairs)`);

    for (let run=0; run<2; run++) {
      process.stdout.write(`  Run ${run+1}/2...`);
      const db = new NodeDuckDBBackend('/tmp/er_llm_'+bm.name.replace(/[^a-zA-Z0-9]/g,'_')+'_'+run+'.db');
      const t0 = performance.now();
      const result = await runSqlLinkage(left, right, bm.config, db);
      const elapsed = performance.now() - t0;
      const pairs = result.pairs ?? [];
      const pred = new Set<string>();
      for (const p of pairs) if ((p.score??0) >= (bm.config.matchThreshold??0.3)) pred.add(lIds[p.leftId]+'|'+rIds[p.rightId]);
      let tp=0; for (const p of pred) if (truth.has(p)) tp++;
      const f1 = tp>0?(2*tp)/(2*tp+(pred.size-tp)+(truth.size-tp)):0;
      console.log(' F1='+f1.toFixed(4)+' P='+(pred.size>0?(tp/pred.size):0).toFixed(4)+' R='+(tp/truth.size).toFixed(4)+' pairs='+pairs.length+' time='+(elapsed/1000).toFixed(1)+'s');
      await db.close();
    }
  }

  console.log('\nNote: LLM re-ranking requires pipeline runner integration (I43).');
  console.log('SQL fast path does not support llmRerank — use runPipeline() with JS path.');
}
main();
