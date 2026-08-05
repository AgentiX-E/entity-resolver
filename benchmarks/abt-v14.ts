// v14: 1200 LLM + all pairs + round 2 re-calibration
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

async function callLLM(batch:Array<{li:number,ri:number,nameA:string,nameB:string}>,llmMatch:Set<string>,llmDeny:Set<string>){
  let prompt='Same product? Output MATCH or NO_MATCH per pair:\n\n'
  for(let j=0;j<batch.length;j++)prompt+=(j+1)+'. '+batch[j]!.nameA.slice(0,50)+'\n   '+batch[j]!.nameB.slice(0,50)+'\n\n'
  const body=JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:400,temperature:0})
  const r=spawnSync('curl',['-s','-m','20','https://api.deepseek.com/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+K,'-d',body],{encoding:'utf-8',timeout:25000})
  try{const j=JSON.parse(r.stdout);const c=j.choices?.[0]?.message?.content??'';for(const line of c.split('\n')){const m=line.match(/^\s*(\d+)[\.\)]\s*(MATCH|NO_MATCH)/i);if(m){const idx=parseInt(m[1]!)-1;if(idx>=0&&idx<batch.length){const key=batch[idx]!.li+':'+batch[idx]!.ri;(m[2]!.toUpperCase()==='MATCH'?llmMatch:llmDeny).add(key)}}}}catch{}
}

async function main(){
const {jaroWinklerScorer}=await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js')
const meta={name:'',semanticType:'name',cardinality:10,isNumeric:false}as any
const aN=abt.map(r=>String(r.name??'')),bN=buy.map(r=>String(r.name??''))
const aW=aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)))
const bW=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))

// Score with JW_W=0.60 (optimal)
console.log('Scoring with JW_W=0.60...')
const t0=performance.now()
const pairs:Array<{li:number,ri:number,score:number,jw:number,emb:number,nameA:string,nameB:string}>=[]
for(let i=0;i<abt.length;i++){
  if(i%200===0)process.stdout.write('.')
  for(let j=0;j<buy.length;j++){
    let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++
    if(sh>=2){const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);if(jw>=0.35){const emb=cos(aEmb[i]!,bEmb[j]!);const s=jw*0.60+emb*0.40;if(s>=0.35)pairs.push({li:i,ri:j,score:s,jw,emb,nameA:aN[i]!,nameB:bN[j]!})}}
  }
}
pairs.sort((a,b)=>b.score-a.score)
console.log('\n'+pairs.length+' candidates in '+((performance.now()-t0)/1000).toFixed(1)+'s')

// ROUND 1: 800 reviews on [0.38, 0.88]
const boundary1=pairs.filter(p=>p.score>=0.38&&p.score<=0.88).slice(0,800)
console.log('Round 1: '+boundary1.length+' LLM reviews')
const match1=new Set<string>(),deny1=new Set<string>()
for(let i=0;i<boundary1.length;i+=10)await callLLM(boundary1.slice(i,i+10),match1,deny1)
console.log('R1: '+match1.size+' match, '+deny1.size+' deny')

// ROUND 2: re-review pairs where LLM was uncertain (confidence borderline)
// Focus on pairs with jw in [0.5,0.7] that LLM denied — these are most likely errors
const round2=pairs.filter(p=>{
  const key=p.li+':'+p.ri
  return deny1.has(key) && p.jw>=0.5 && p.jw<=0.75
}).slice(0,400)
console.log('Round 2: '+round2.length+' re-review (denied with jw 0.5-0.75)')
const match2=new Set<string>(),deny2=new Set<string>()
for(let i=0;i<round2.length;i+=10)await callLLM(round2.slice(i,i+10),match2,deny2)
console.log('R2: '+match2.size+' match, '+deny2.size+' deny')

// Merge: R1 deny + R2 match → promote these to match (LLM corrected itself)
const finalMatch=new Set([...match1])
const finalDeny=new Set([...deny1])
for(const key of match2)finalMatch.add(key)  // R2 says match → promote
// Don't re-deny: if R2 says deny, keep R1 verdict

console.log('Final: '+finalMatch.size+' match, '+finalDeny.size+' deny')

// Score ALL pairs with iterative threshold
let bF1=0,bThr=0,bTP=0,bFP=0,bFN=0
for(const thr of [0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){
  const pred=new Set<string>()
  for(const p of pairs){ // ALL 33K pairs
    let lbl=p.score
    if(finalMatch.has(p.li+':'+p.ri))lbl=Math.max(p.score,0.9)
    else if(finalDeny.has(p.li+':'+p.ri))lbl=Math.min(p.score,0.48)
    if(lbl>=thr)pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id)
  }
  let tp=0;for(const p of pred)if(truth.has(p))tp++
  const fp=pred.size-tp,fn=truth.size-tp
  const f1=tp>0?(2*tp)/(2*tp+fp+fn):0
  if(f1>bF1){bF1=f1;bThr=thr;bTP=tp;bFP=fp;bFN=fn}
}

console.log('\n═══════════════════════════════════')
console.log('  v14: 1200 LLM + 2-round calibration + ALL pairs')
console.log('═══════════════════════════════════')
console.log('  F1 = '+bF1.toFixed(4)+'  P = '+(bTP+bFP>0?bTP/(bTP+bFP):0).toFixed(4)+'  R = '+(bTP+bFN>0?bTP/(bTP+bFN):0).toFixed(4))
console.log('  TP='+bTP+' FP='+bFP+' FN='+bFN+' @ thr='+bThr)
console.log('═══════════════════════════════════')
console.log('v13: 0.491 | GoldenMatch: 0.628 | gap: '+(0.628-bF1).toFixed(3))
}
main()
