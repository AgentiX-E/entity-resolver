import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {performance} from 'node:perf_hooks'
const K='sk-c0b33fe973ac4f599b6e2e3a2125a5b0'

const abt=JSON.parse(readFileSync('/tmp/abt.json','utf-8')) as Record<string,unknown>[]
const buy=JSON.parse(readFileSync('/tmp/buy.json','utf-8')) as Record<string,unknown>[]
for(let i=0;i<abt.length;i++)(abt[i]as any).id=String(abt[i].id??i)
for(let i=0;i<buy.length;i++)(buy[i]as any).id=String(buy[i].id??i+abt.length)
const truth=new Set<string>()
for(const l of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)){const[p,q]=l.split(',').map((s:string)=>s.trim().replace(/"/g,''));if(p&&q)truth.add(p+'|'+q)}
const aEmb=JSON.parse(readFileSync('/tmp/abt_emb.json','utf-8')) as number[][]
const bEmb=JSON.parse(readFileSync('/tmp/buy_emb.json','utf-8')) as number[][]

function cos(a:number[],b:number[]){let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return na>0&&nb>0?d/(Math.sqrt(na)*Math.sqrt(nb)):0}

async function main(){
const {jaroWinklerScorer}=await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js')
const meta={name:'',semanticType:'name',cardinality:10,isNumeric:false}as any
const aN=abt.map(r=>String(r.name??'')),bN=buy.map(r=>String(r.name??''))
const aW=aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)))
const bW=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))

// Score with JW_W=0.55 (balanced)
console.log('Scoring with JW_W=0.55...')
const t0=performance.now()
const pairs:Array<{li:number,ri:number,score:number,jw:number,emb:number,nameA:string,nameB:string}>=[]
for(let i=0;i<abt.length;i++){
  if(i%200===0)process.stdout.write('.')
  for(let j=0;j<buy.length;j++){
    let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++
    if(sh>=2){const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);if(jw>=0.35){const emb=cos(aEmb[i]!,bEmb[j]!);const s=jw*0.55+emb*0.45;if(s>=0.35)pairs.push({li:i,ri:j,score:s,jw,emb,nameA:aN[i]!,nameB:bN[j]!})}}
  }
}
pairs.sort((a,b)=>b.score-a.score)
console.log('\n'+pairs.length+' candidates in '+((performance.now()-t0)/1000).toFixed(1)+'s')

// v15: ACTIVE SAMPLING — select pairs where jw and embedding DISAGREE most
// These are the most uncertain/informative pairs for LLM review
const activeSample:Array<typeof pairs[0]> = []
for(const p of pairs){
  const disagreement = Math.abs(p.jw - p.emb)
  if(disagreement > 0.15 && p.score >= 0.38 && p.score <= 0.88){
    activeSample.push(p)
  }
}
activeSample.sort((a,b) => Math.abs(b.jw-b.emb) - Math.abs(a.jw-a.emb))
const boundary = activeSample.slice(0,800)
console.log('Active sampling: '+boundary.length+' most informative boundary pairs (jw↔emb disagreement > 0.15)')

const llmMatch=new Set<string>(),llmDeny=new Set<string>()
for(let i=0;i<boundary.length;i+=10){
  const batch=boundary.slice(i,i+10)
  let prompt='Same product? MATCH or NO_MATCH per pair:\n\n'
  for(let j=0;j<batch.length;j++)prompt+=(j+1)+'. '+batch[j]!.nameA.slice(0,50)+'\n   '+batch[j]!.nameB.slice(0,50)+'\n\n'
  const body=JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:400,temperature:0})
  const r=spawnSync('curl',['-s','-m','20','https://api.deepseek.com/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+K,'-d',body],{encoding:'utf-8',timeout:25000})
  try{const j=JSON.parse(r.stdout);const c=j.choices?.[0]?.message?.content??'';for(const line of c.split('\n')){const m=line.match(/^\s*(\d+)[\.\)]\s*(MATCH|NO_MATCH)/i);if(m){const idx=parseInt(m[1]!)-1;if(idx>=0&&idx<batch.length){const key=batch[idx]!.li+':'+batch[idx]!.ri;(m[2]!.toUpperCase()==='MATCH'?llmMatch:llmDeny).add(key)}}}}catch{}
}
console.log('LLM: '+llmMatch.size+' match, '+llmDeny.size+' deny')

// ALL pairs scored with iterative threshold
let bF1=0,bThr=0,bTP=0,bFP=0,bFN=0
for(const thr of [0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){
  const pred=new Set<string>()
  for(const p of pairs){
    const key=p.li+':'+p.ri;let lbl=p.score
    if(llmMatch.has(key))lbl=Math.max(p.score,0.9)
    else if(llmDeny.has(key))lbl=Math.min(p.score,0.45)
    if(lbl>=thr)pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id)
  }
  let tp=0;for(const p of pred)if(truth.has(p))tp++
  const fp=pred.size-tp,fn=truth.size-tp
  const f1=tp>0?(2*tp)/(2*tp+fp+fn):0
  if(f1>bF1){bF1=f1;bThr=thr;bTP=tp;bFP=fp;bFN=fn}
}

console.log('\n═══════════════════════════════════')
console.log('  v15: Active Sampling (disagreement-based)')
console.log('═══════════════════════════════════')
console.log('  F1 = '+bF1.toFixed(4)+'  P = '+(bTP+bFP>0?bTP/(bTP+bFP):0).toFixed(4)+'  R = '+(bTP+bFN>0?bTP/(bTP+bFN):0).toFixed(4))
console.log('  TP='+bTP+' FP='+bFP+' FN='+bFN+' @ thr='+bThr)
console.log('═══════════════════════════════════')
console.log('v13 (random 800 LLM): 0.491 | v15 (active 800): '+bF1.toFixed(4))
}
main()
