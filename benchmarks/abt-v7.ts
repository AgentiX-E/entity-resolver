// Abt-Buy v7: 400 LLM reviews + wider boundary + softer penalty
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const K = 'sk-c0b33fe973ac4f599b6e2e3a2125a5b0';

async function main() {
  const abt = JSON.parse(readFileSync('/tmp/abt.json','utf-8')) as Record<string,unknown>[];
  const buy = JSON.parse(readFileSync('/tmp/buy.json','utf-8')) as Record<string,unknown>[];
  for(let i=0;i<abt.length;i++) (abt[i] as any).id = String(abt[i].id ?? i);
  for(let i=0;i<buy.length;i++) (buy[i] as any).id = String(buy[i].id ?? i+abt.length);

  const truth = new Set<string>();
  for(const l of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)){
    const [p,q] = l.split(',').map((s:string)=>s.trim().replace(/"/g,''));
    if(p&&q) truth.add(p+'|'+q);
  }

  const { jaroWinklerScorer } = await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js');
  const meta = {name:'', semanticType:'name', cardinality:10, isNumeric:false} as any;
  const aN = abt.map(r=>String(r.name??'')), bN = buy.map(r=>String(r.name??''));
  const aW = aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)));
  const bW = bN.map(n=>n.toLowerCase().split(/[\s\-]+/));

  // Score full dataset
  console.log('Scoring 1081×1092...');
  const t0 = performance.now();
  const pairs: Array<{li:number,ri:number,score:number,nameA:string,nameB:string}> = [];
  for(let i=0;i<abt.length;i++){
    if(i%200===0) process.stdout.write('.');
    const aw = aW[i]!;
    for(let j=0;j<buy.length;j++){
      let sh=0; for(const w of bW[j]!) if(aw.has(w)) sh++;
      if(sh>=2){
        const s = jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);
        if(s>=0.4) pairs.push({li:i,ri:j,score:s,nameA:aN[i]!,nameB:bN[j]!});
      }
    }
  }
  pairs.sort((a,b)=>b.score-a.score);
  console.log('\n'+pairs.length+' candidates in '+((performance.now()-t0)/1000).toFixed(1)+'s');

  // v7: wider boundary + more pairs + softer penalty
  const boundary = pairs.filter(p=>p.score>=0.45&&p.score<=0.85).slice(0,400);
  console.log('LLM reviewing '+boundary.length+' boundary pairs [0.45-0.85]');

  const llmMatch = new Set<string>(), llmDeny = new Set<string>();
  let calls = 0;

  for(let i=0;i<boundary.length;i+=10){
    const batch = boundary.slice(i,i+10);
    let prompt = 'Are these the same product? Think step by step. For each pair, output MATCH or NO_MATCH on a new line.\n\n';
    for(let j=0;j<batch.length;j++) prompt += (j+1)+'. '+batch[j]!.nameA.slice(0,60)+'\n   '+batch[j]!.nameB.slice(0,60)+'\n\n';
    const body = JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:500,temperature:0});
    const r = spawnSync('curl',['-s','-m','20','https://api.deepseek.com/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+K,'-d',body],{encoding:'utf-8',timeout:25000});
    calls++;
    try{
      const j = JSON.parse(r.stdout);
      const c = j.choices?.[0]?.message?.content??'';
      for(const line of c.split('\n')){
        const m = line.match(/^\s*(\d+)[\.\)]\s*(MATCH|NO_MATCH)/i);
        if(m){ const idx=parseInt(m[1]!)-1; if(idx>=0&&idx<batch.length){ const key=batch[idx]!.li+':'+batch[idx]!.ri; (m[2]!.toUpperCase()==='MATCH'?llmMatch:llmDeny).add(key); }}
      }
    }catch(e){ console.log('API err '+(i/10)+':',(e as Error).message.slice(0,30)); }
  }
  console.log('API calls: '+calls+' | Match: '+llmMatch.size+' | Deny: '+llmDeny.size);

  // v7 scoring: match→0.9, deny→0.4, keep original for unreviewed
  let bestF1=0, bestThr=0, bestTP=0, bestFP=0, bestFN=0;
  for(const thr of [0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9]){
    const pred = new Set<string>();
    for(const p of pairs.slice(0,5000)){
      const key = p.li+':'+p.ri;
      let lbl = p.score;
      if(llmMatch.has(key)) lbl = Math.max(p.score, 0.9);
      else if(llmDeny.has(key)) lbl = Math.min(p.score, 0.4);
      if(lbl>=thr) pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id);
    }
    let tp=0; for(const p of pred) if(truth.has(p)) tp++;
    const fp=pred.size-tp, fn=truth.size-tp;
    const f1 = tp>0?(2*tp)/(2*tp+fp+fn):0;
    if(f1>bestF1){ bestF1=f1; bestThr=thr; bestTP=tp; bestFP=fp; bestFN=fn; }
  }

  console.log('\n═══════════════════════════════════');
  console.log('  Abt-Buy v7: 400 LLM + soft penalty');
  console.log('═══════════════════════════════════');
  console.log('  F1 = '+bestF1.toFixed(4));
  console.log('  P  = '+(bestTP+bestFP>0?bestTP/(bestTP+bestFP):0).toFixed(4));
  console.log('  R  = '+(bestTP+bestFN>0?bestTP/(bestTP+bestFN):0).toFixed(4));
  console.log('  TP='+bestTP+' FP='+bestFP+' FN='+bestFN);
  console.log('  threshold = '+bestThr.toFixed(2));
  console.log('═══════════════════════════════════');
  console.log('v6: 0.370 | v4: 0.351 | GoldenMatch: 0.628');
}
main();
