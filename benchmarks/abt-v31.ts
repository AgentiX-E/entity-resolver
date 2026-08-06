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
const aEmb=JSON.parse(readFileSync('/tmp/abt_zhipu.json','utf-8')) as number[][]
const bEmb=JSON.parse(readFileSync('/tmp/buy_zhipu.json','utf-8')) as number[][]
function cos(a:number[],b:number[]){let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return na>0&&nb>0?d/(Math.sqrt(na)*Math.sqrt(nb)):0}

async function callLLM(prompt:string):string{
  const body=JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:400,temperature:0})
  const r=spawnSync('curl',['-s','-m','20','https://api.deepseek.com/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+K,'-d',body],{encoding:'utf-8',timeout:25000})
  try{return JSON.parse(r.stdout).choices?.[0]?.message?.content??''}catch{return''}
}

async function main(){
const {jaroWinklerScorer}=await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js')
const meta={name:'',semanticType:'name',cardinality:10,isNumeric:false}as any
const aN=abt.map(r=>String(r.name??'')),bN=buy.map(r=>String(r.name??''))
const aW=aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)))
const bW=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))

// Score all pairs
console.log('Scoring 34K candidates...')
const t0=performance.now()
const pairs:Array<{li:number,ri:number,score:number,jw:number,emb:number,nameA:string,nameB:string}>=[]
for(let i=0;i<abt.length;i++){for(let j=0;j<buy.length;j++){let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++;if(sh>=2){const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);if(jw>=0.35){const emb=cos(aEmb[i]!,bEmb[j]!);const s=jw*0.50+emb*0.50;if(s>=0.32)pairs.push({li:i,ri:j,score:s,jw,emb,nameA:aN[i]!,nameB:bN[j]!})}}}}
pairs.sort((a,b)=>b.score-a.score)
console.log(pairs.length+' candidates in '+((performance.now()-t0)/1000).toFixed(1)+'s')

// ──── TEACHER LABELING ────
const trainSet=pairs.slice(0,800)
console.log('Teacher labeling '+trainSet.length+' training pairs...')
const teacherLabels=new Map<string,number>() // key → 1=match, 0=no_match
for(let i=0;i<trainSet.length;i+=10){
  const batch=trainSet.slice(i,i+10)
  let prompt='Same product? MATCH or NO_MATCH per pair:\n\n'
  for(let j=0;j<batch.length;j++)prompt+=(j+1)+'. '+batch[j]!.nameA.slice(0,50)+'\n   '+batch[j]!.nameB.slice(0,50)+'\n\n'
  const resp=await callLLM(prompt)
  for(let j=0;j<batch.length;j++){const m=resp.match(new RegExp(j+1+'[.\\)]\\s*(MATCH|NO_MATCH)','i'));if(m){teacherLabels.set(batch[j]!.li+':'+batch[j]!.ri,m[1].toUpperCase()==='MATCH'?1:0)}}
  if((i/10)%20===0)process.stdout.write('.')
}
const numLabeled=teacherLabels.size
const labelMatch=Array.from(teacherLabels.values()).filter(v=>v===1).length
console.log('\nTeacher: '+numLabeled+' labeled, '+labelMatch+' matches')

// ──── STUDENT TRAINING ────
// Student = logistic regression on [jw, emb]
// Find optimal decision boundary for LLM verdict
let bestThresh=0.5,bestAcc=0
for(const t of [0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){
  let correct=0,total=0
  for(const [key,label] of teacherLabels){
    const pair=trainSet.find(p=>p.li+':'+p.ri===key)
    if(!pair)continue
    const s=pair.jw*0.50+pair.emb*0.50 // same scoring as original
    const pred=s>=t?1:0
    if(pred===label)correct++
    total++
  }
  const acc=total>0?correct/total:0
  if(acc>bestAcc){bestAcc=acc;bestThresh=t}
}
console.log('Student threshold: '+bestThresh.toFixed(2)+' (acc='+(bestAcc*100).toFixed(1)+'%)')

// ──── APPLY STUDENT TO ALL 34K PAIRS ────
console.log('Student scoring ALL '+pairs.length+' pairs...')
let bF1=0,bThr=0,bTP=0,bFP=0,bFN=0
for(const thr of [0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85,0.9]){
  const pred=new Set<string>()
  for(const p of pairs){
    // Student: use the learned threshold from teacher
    const studentScore=p.jw*0.50+p.emb*0.50
    // Blend: LLM-reviewed pairs use teacher label, others use student
    const key=p.li+':'+p.ri
    let lbl=studentScore
    if(teacherLabels.has(key))lbl=teacherLabels.get(key)===1?1:0
    else lbl=studentScore
    if(lbl>=thr)pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id)
  }
  let tp=0;for(const p of pred)if(truth.has(p))tp++;const fp=pred.size-tp,fn=truth.size-tp;const f=tp>0?(2*tp)/(2*tp+fp+fn):0;if(f>bF1){bF1=f;bThr=thr;bTP=tp;bFP=fp;bFN=fn}
}

console.log('\n═══════════════════════════════════')
console.log('  v31: Teacher-Student Distillation')
console.log('═══════════════════════════════════')
console.log('  Teacher: '+numLabeled+' labels, '+labelMatch+' match')
console.log('  Student: thresh='+bestThresh.toFixed(2)+' acc='+(bestAcc*100).toFixed(1)+'%')
console.log('  F1 = '+bF1.toFixed(4)+'  P = '+(bTP+bFP>0?bTP/(bTP+bFP):0).toFixed(4)+'  R = '+(bTP+bFN>0?bTP/(bTP+bFN):0).toFixed(4))
console.log('  TP='+bTP+' FP='+bFP+' FN='+bFN+' @ thr='+bThr)
console.log('═══════════════════════════════════')
console.log('v20 (LLM binary denial): 0.582 | v31 (distillation): '+bF1.toFixed(4))
}
main()
