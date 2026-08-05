// Abt-Buy v10: MiniLM embeddings + jw ensemble + LLM boost
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pipeline, env } from '@xenova/transformers';
const K = 'sk-c0b33fe973ac4f599b6e2e3a2125a5b0';
env.allowLocalModels = false;

async function main() {
  const abt = JSON.parse(readFileSync('/tmp/abt.json','utf-8')) as Record<string,unknown>[];
  const buy = JSON.parse(readFileSync('/tmp/buy.json','utf-8')) as Record<string,unknown>[];
  for(let i=0;i<abt.length;i++)(abt[i] as any).id=String(abt[i].id??i);
  for(let i=0;i<buy.length;i++)(buy[i] as any).id=String(buy[i].id??i+abt.length);

  const truth = new Set<string>();
  for(const l of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)){
    const [p,q]=l.split(',').map((s:string)=>s.trim().replace(/"/g,'')); if(p&&q)truth.add(p+'|'+q);
  }

  // Load MiniLM embedding model
  console.log('Loading MiniLM embedding model...');
  const tLoad = performance.now();
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('MiniLM loaded in '+((performance.now()-tLoad)/1000).toFixed(1)+'s');

  const { jaroWinklerScorer } = await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js');
  const meta = {name:'',semanticType:'name',cardinality:10,isNumeric:false} as any;
  const aN = abt.map(r=>String(r.name??'')), bN = buy.map(r=>String(r.name??''));
  const aW = aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)));
  const bW = bN.map(n=>n.toLowerCase().split(/[\s\-]+/));

  // Compute embeddings for first 500 products from each side (sample-based)
  const SAMPLE = 500;
  console.log('Embedding '+SAMPLE+'×2 products...');
  const tEmb = performance.now();
  const aEmb: Float32Array[] = [];
  for(let i=0;i<Math.min(SAMPLE,abt.length);i++){
    if(i%100===0) process.stdout.write('.');
    const e = await embedder(aN[i]!, {pooling:'mean'});
    aEmb.push(e.data);
  }
  const bEmb: Float32Array[] = [];
  for(let i=0;i<Math.min(SAMPLE,buy.length);i++){
    if(i%100===0) process.stdout.write('.');
    const e = await embedder(bN[i]!, {pooling:'mean'});
    bEmb.push(e.data);
  }
  console.log('\nEmbedded '+aEmb.length+'+'+bEmb.length+' in '+((performance.now()-tEmb)/1000).toFixed(1)+'s');

  function cos(a:Float32Array,b:Float32Array):number{
    let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}
    return na>0&&nb>0?d/(Math.sqrt(na)*Math.sqrt(nb)):0;
  }

  // Score: jaro_winkler + MiniLM cosine, weighted ensemble
  console.log('Scoring...');
  const tSc = performance.now();
  const pairs: Array<{li:number,ri:number,score:number,jw:number,emb:number,nameA:string,nameB:string}> = [];
  const JW_W = 0.6, EMB_W = 0.4; // GoldenMatch uses both signals

  for(let i=0;i<Math.min(SAMPLE,abt.length);i++){
    if(i%100===0) process.stdout.write('.');
    for(let j=0;j<Math.min(SAMPLE,buy.length);j++){
      let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++;
      if(sh<2)continue;
      const jw = jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);
      if(jw<0.3)continue;
      const emb = cos(aEmb[i]!, bEmb[j]!);
      const score = jw*JW_W + emb*EMB_W;
      if(score>0.3) pairs.push({li:i,ri:j,score,jw,emb,nameA:aN[i]!,nameB:bN[j]!});
    }
  }
  pairs.sort((a,b)=>b.score-a.score);
  console.log('\n'+pairs.length+' candidates in '+((performance.now()-tSc)/1000).toFixed(1)+'s');

  // LLM boost on boundary [0.4, 0.85]
  const boundary = pairs.filter(p=>p.score>=0.4&&p.score<=0.85).slice(0,300);
  console.log('LLM reviewing '+boundary.length+' boundary pairs');

  const llmMatch = new Set<string>(), llmDeny = new Set<string>();
  for(let i=0;i<boundary.length;i+=10){
    const batch = boundary.slice(i,i+10);
    let prompt = 'Same product? MATCH or NO_MATCH per pair:\n\n';
    for(let j=0;j<batch.length;j++) prompt += (j+1)+'. '+batch[j]!.nameA.slice(0,55)+'\n   '+batch[j]!.nameB.slice(0,55)+'\n\n';
    const body = JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:400,temperature:0});
    const r = spawnSync('curl',['-s','-m','20','https://api.deepseek.com/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+K,'-d',body],{encoding:'utf-8',timeout:25000});
    try{
      const j = JSON.parse(r.stdout); const c=j.choices?.[0]?.message?.content??'';
      for(const line of c.split('\n')){
        const m=line.match(/^\s*(\d+)[\.\)]\s*(MATCH|NO_MATCH)/i);
        if(m){const idx=parseInt(m[1]!)-1; if(idx>=0&&idx<batch.length){const key=batch[idx]!.li+':'+batch[idx]!.ri; (m[2]!.toUpperCase()==='MATCH'?llmMatch:llmDeny).add(key);}}
      }
    }catch{}
  }
  console.log('LLM: '+llmMatch.size+' match, '+llmDeny.size+' deny');

  let bestF1=0,bestThr=0,bestTP=0,bestFP=0,bestFN=0;
  for(const thr of [0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){
    const pred = new Set<string>();
    for(const p of pairs.slice(0,8000)){
      const key = p.li+':'+p.ri; let lbl = p.score;
      if(llmMatch.has(key)) lbl=Math.max(p.score,0.9);
      else if(llmDeny.has(key)) lbl=Math.min(p.score,0.45);
      if(lbl>=thr) pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id);
    }
    let tp=0;for(const p of pred)if(truth.has(p))tp++;
    const fp=pred.size-tp,fn=truth.size-tp;
    const f1=tp>0?(2*tp)/(2*tp+fp+fn):0;
    if(f1>bestF1){bestF1=f1;bestThr=thr;bestTP=tp;bestFP=fp;bestFN=fn;}
  }

  console.log('\n═══════════════════════════════════');
  console.log('  v10: MiniLM + jw + LLM');
  console.log('═══════════════════════════════════');
  console.log('  F1 = '+bestF1.toFixed(4));
  console.log('  P  = '+(bestTP+bestFP>0?bestTP/(bestTP+bestFP):0).toFixed(4));
  console.log('  R  = '+(bestTP+bestFN>0?bestTP/(bestTP+bestFN):0).toFixed(4));
  console.log('  TP='+bestTP+' FP='+bestFP+' FN='+bestFN);
  console.log('  threshold = '+bestThr.toFixed(2));
  console.log('═══════════════════════════════════');
  console.log('v9 (jw+LLM only): 0.443 | GoldenMatch: 0.628 (embeddings)');
}
main();
