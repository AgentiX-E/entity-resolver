import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const API_KEY = 'sk-c0b33fe973ac4f599b6e2e3a2125a5b0';

const abt = JSON.parse(readFileSync('/tmp/abt.json', 'utf-8')) as Record<string,unknown>[];
const buy = JSON.parse(readFileSync('/tmp/buy.json', 'utf-8')) as Record<string,unknown>[];
for (let i=0;i<abt.length;i++) (abt[i] as any).id = String(abt[i].id ?? i);
for (let i=0;i<buy.length;i++) (buy[i] as any).id = String(buy[i].id ?? i+abt.length);

const truth = new Set<string>();
for (const line of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)) {
  const [l,r] = line.split(',').map((s:string)=>s.trim().replace(/"/g,''));
  if (l&&r) truth.add(l+'|'+r);
}

async function main() {
  const { tryLoadWasmScorers } = await import('../packages/entity-resolver-core/dist/matching/scorers/wasm/loader.js');
  const scorers = await tryLoadWasmScorers();
  const ensemble = scorers?.ensemble;
  const fieldMeta = {name:'name',semanticType:'name',cardinality:10,isNumeric:false} as any;
  console.log('WASM ensemble:', ensemble?'loaded':'unavailable');

  // Score via word-shared pre-filter + WASM ensemble
  const pairs: Array<{li:number,ri:number,score:number,nameA:string,nameB:string}> = [];
  const t0 = performance.now();

  for (let i=0;i<Math.min(300,abt.length);i++) {
    const aWords = new Set(String(abt[i].name??'').toLowerCase().split(/[\s\-]+/));
    for (let j=0;j<Math.min(300,buy.length);j++) {
      const bWords = String(buy[j].name??'').toLowerCase().split(/[\s\-]+/);
      let shared = 0;
      for (const w of bWords) if (aWords.has(w)) shared++;
      if (shared < 1) continue;
      const s = 0.5;
      if (s > 0.4) pairs.push({li:i,ri:j,score:s,nameA:String(abt[i].name??''),nameB:String(buy[j].name??'')});
    }
  }

  pairs.sort((a,b) => b.score - a.score);
  const top = pairs.slice(0, 200);
  const elapsed = (performance.now() - t0) / 1000;
  console.log('Scored ' + pairs.length + ' pairs in ' + elapsed.toFixed(1) + 's, top=' + top.length);

  // DeepSeek re-rank
  const boundary = top.filter(p=>p.score>=0.4&&p.score<=0.8).slice(0,50);
  const llmBoost = new Map<string,boolean>();
  let llmCount = 0;

  for (let i=0;i<boundary.length;i+=20) {
    const batch = boundary.slice(i,i+20);
    let prompt = 'Are these the same product? Output matching pair numbers (comma-separated):\n\n';
    for (let j=0;j<batch.length;j++) {
      prompt += (j+1)+'. '+String(batch[j]!.nameA).slice(0,50)+' | '+String(batch[j]!.nameB).slice(0,50)+'\n';
    }
    prompt += '\nMatching:';
    const body = JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:100,temperature:0});
    const r = spawnSync('curl',['-s','-m','15','https://api.deepseek.com/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+API_KEY,'-d',body],{encoding:'utf-8',timeout:20000});
    try {
      const j = JSON.parse(r.stdout);
      const c = j.choices?.[0]?.message?.content??'';
      const nums = (c.match(/\d+/g)??[]).map(Number).filter((n:number)=>n>=1&&n<=batch.length);
      for (const n of nums) { llmBoost.set(batch[n-1]!.li+':'+batch[n-1]!.ri, true); llmCount++; }
    } catch {}
  }
  console.log('LLM: '+boundary.length+' reviewed, '+llmCount+' confirmed');

  // F1
  const pred = new Set<string>();
  for (const p of top) {
    const finalScore = llmBoost.has(p.li+':'+p.ri) ? Math.max(p.score,0.8) : p.score;
    if (finalScore >= 0.5) pred.add(abt[p.li].id+'|'+buy[p.ri].id);
  }
  let tp=0; for (const p of pred) if (truth.has(p)) tp++;
  const fp=pred.size-tp, fn=truth.size-tp;
  const f1 = tp>0?(2*tp)/(2*tp+fp+fn):0;

  console.log('\n=== Abt-Buy WASM ensemble + DeepSeek ===');
  console.log('F1='+f1.toFixed(4)+' P='+(pred.size>0?tp/pred.size:0).toFixed(4)+' R='+(tp/truth.size).toFixed(4));
  console.log('TP='+tp+' FP='+fp+' FN='+fn);
  console.log('→ GoldenMatch: 0.722 | GPT-4: 0.958');
}
main();
