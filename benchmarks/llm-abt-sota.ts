// LLM-enhanced Abt-Buy benchmark — WASM ensemble + DeepSeek re-rank
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const API_KEY = 'sk-c0b33fe973ac4f599b6e2e3a2125a5b0';
const BASE = '/workspace/entity-resolver/benchmarks/datasets/Abt-Buy';

async function main() {
  const [{ runPipeline, tryLoadWasmScorers }, { NodeDuckDBBackend }] = await Promise.all([
    import('../packages/entity-resolver-core/dist/index.js'),
    import('../packages/entity-resolver-node/dist/duckdb-backend.js'),
  ]);

  // Load data
  const abt = JSON.parse(readFileSync('/tmp/abt.json', 'utf-8')) as Record<string,unknown>[];
  const buy = JSON.parse(readFileSync('/tmp/buy.json', 'utf-8')) as Record<string,unknown>[];
  for (let i=0;i<abt.length;i++) (abt[i] as any).id = String(abt[i].id ?? i);
  for (let i=0;i<buy.length;i++) (buy[i] as any).id = String(buy[i].id ?? i+abt.length);

  // Load truth
  const truth = new Set<string>();
  for (const line of readFileSync(BASE + '/abt_buy_perfectMapping.csv', 'utf-8').trim().split('\n').slice(1)) {
    const [l,r] = line.split(',').map((s:string)=>s.trim().replace(/"/g,''));
    if (l&&r) truth.add(l+'|'+r);
  }

  // Apply k-shingle blocking for better candidate generation
  const all = [...abt, ...buy];
  const candidates: Array<{leftId:number,rightId:number,score:number}> = [];
  const kshingleMap = new Map<string,number[]>();

  // Build index on k-shingles of product names
  for (let i=0;i<all.length;i++) {
    const name = String(all[i]?.name ?? '').toLowerCase();
    for (let k=0;k<=name.length-3;k++) {
      const shingle = name.substring(k,k+3);
      const indices = kshingleMap.get(shingle) ?? [];
      indices.push(i);
      kshingleMap.set(shingle, indices);
    }
  }

  // Find cross-source pairs sharing at least 2 shingles
  const pairCount = new Map<string,number>();
  for (const [,indices] of kshingleMap) {
    for (const i of indices) {
      for (const j of indices) {
        if (i===j) continue;
        const isCrossSource = (i<abt.length)!==(j<abt.length);
        if (!isCrossSource) continue;
        const key = Math.min(i,j)+':'+Math.max(i,j);
        pairCount.set(key,(pairCount.get(key)??0)+1);
      }
    }
  }

  // Filter pairs with >=2 shared shingles
  for (const [key,count] of pairCount) {
    if (count>=2) {
      const [i,j] = key.split(':').map(Number);
      candidates.push({leftId:i!,rightId:j!,score:count/10});
    }
  }

  candidates.sort((a,b)=>b.score-a.score);
  console.log('Abt-Buy: '+abt.length+'+'+buy.length+' records, '+truth.size+' truth pairs');
  console.log('Blocking: '+candidates.length+' candidates (k-shingle >= 2)');

  // Score top 500 with WASM ensemble via JS scorer
  const wasmScorers = await tryLoadWasmScorers();
  const ensembleScorer = wasmScorers?.ensemble;

  const topK = candidates.slice(0, 500);
  const scoredPairs: Array<{leftId:number,rightId:number,score:number,prob:number}> = [];

  for (const c of topK) {
    const nameA = String(all[c.leftId]?.name ?? '');
    const nameB = String(all[c.rightId]?.name ?? '');
    if (ensembleScorer) {
      const s = ensembleScorer.score(nameA, nameB, {name:'name',semanticType:'name',cardinality:10,isNumeric:false});
      scoredPairs.push({leftId:c.leftId,rightId:c.rightId,score:s,prob:s});
    } else {
      // Fallback: jaro_winkler
      const {jaroWinkler} = await import('../packages/entity-resolver-core/node_modules/strsimkit/dist/index.js');
      const s = jaroWinkler(nameA, nameB);
      scoredPairs.push({leftId:c.leftId,rightId:c.rightId,score:s,prob:s});
    }
  }

  scoredPairs.sort((a,b)=>b.score-a.score);

  // LLM re-rank top 30 boundary pairs (scores 0.4-0.8)
  const boundary = scoredPairs.filter(p=>p.score>=0.4 && p.score<=0.8).slice(0,50);
  const llmResults = new Map<string,number>();

  if (boundary.length > 0) {
    const batchSize = 20;
    for (let i=0;i<Math.min(boundary.length,40);i+=batchSize) {
      const batch = boundary.slice(i,i+batchSize);
      let prompt = 'These are product pairs. Output "MATCH" or "NO_MATCH" for each pair number.\n\n';
      for (let j=0;j<batch.length;j++) {
        prompt += (j+1)+'. '+String(all[batch[j]!.leftId]?.name??'').slice(0,60)+' | '+String(all[batch[j]!.rightId]?.name??'').slice(0,60)+'\n';
      }
      prompt += '\nOutput comma-separated matching pair numbers only:';

      try {
        const resp = execSync('curl -s -m 15 https://api.deepseek.com/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer '+API_KEY+'" -d \''+JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:100,temperature:0})+'\'', {encoding:'utf-8',timeout:20000});
        const j = JSON.parse(resp);
        const content = j.choices?.[0]?.message?.content ?? '';
        const matches = (content.match(/\d+/g)??[]).map(Number).filter((n:number)=>n>=1&&n<=batch.length);
        for (const m of matches) {
          llmResults.set(batch[m-1]!.leftId+':'+batch[m-1]!.rightId, 1.0);
        }
      } catch { /* LLM fail → skip */ }
    }
  }

  // Merge LLM results: LLM-confirmed pairs get boosted
  const pred = new Set<string>();
  for (const p of scoredPairs) {
    const key = p.leftId+':'+p.rightId;
    const llmBoost = llmResults.has(key);
    const isCrossSource = p.leftId<abt.length !== p.rightId<abt.length;
    if (!isCrossSource) continue;
    const finalScore = llmBoost ? Math.max(p.score, 0.8) : p.score;
    if (finalScore >= 0.5) {
      const lId = all[p.leftId]?.id;
      const rId = all[p.rightId]?.id;
      if (lId && rId) pred.add(lId+'|'+rId);
    }
  }

  let tp=0; for (const p of pred) if (truth.has(p)) tp++;
  const fp=pred.size-tp, fn=truth.size-tp;
  const f1=tp>0?(2*tp)/(2*tp+fp+fn):0;

  console.log('\n=== Results ===');
  console.log('LLM pairs reviewed: '+boundary.length);
  console.log('LLM confirmed matches: '+llmResults.size);
  console.log('Predictions: '+pred.size+' (TP='+tp+', FP='+fp+', FN='+fn+')');
  console.log('Ensemble used: '+(ensembleScorer?'WASM':'JS fallback'));
  console.log('F1='+f1.toFixed(4)+' P='+(pred.size>0?tp/pred.size:0).toFixed(4)+' R='+(tp/truth.size).toFixed(4));
  console.log('GoldenMatch Abt-Buy: 0.722 | GPT-4 zero-shot: 0.958');
}
main();
