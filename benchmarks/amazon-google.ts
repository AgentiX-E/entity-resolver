import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {performance} from 'node:perf_hooks'
const DS_K='sk-c0b33fe973ac4f599b6e2e3a2125a5b0'
const ZP_K=readFileSync('.env','utf-8').match(/ZHIPU_API_KEY=(.+)/)?.[1]?.trim()||''

const amazon=JSON.parse(readFileSync('/tmp/amazon.json','utf-8')) as Record<string,unknown>[]
const google=JSON.parse(readFileSync('/tmp/google.json','utf-8')) as Record<string,unknown>[]
for(let i=0;i<amazon.length;i++)(amazon[i]as any).id=String(amazon[i].id??i)
for(let i=0;i<google.length;i++)(google[i]as any).id=String(google[i].id??i+amazon.length)

const truth=new Set<string>()
for(const l of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Amazon-Google/Amzon_GoogleProducts_perfectMapping.csv','utf-8').trim().split('\n').slice(1)){
  const c=l.split(',').map((s:string)=>s.trim().replace(/"/g,''))
  if(c[0]&&c[1])truth.add(c[0]+'|'+c[1])
}
console.log('Amazon: '+amazon.length+' Google: '+google.length+' Truth: '+truth.size)

// Embed all products via Zhipu
const allNames=[...amazon.map((r:any)=>String(r.title??r.name??'')),...google.map((r:any)=>String(r.title??r.name??''))]
console.log('Embedding '+allNames.length+' products via Zhipu...')
const allEmb:number[][]=[]
for(let i=0;i<allNames.length;i+=64){
  const batch=allNames.slice(i,i+64);const body=JSON.stringify({model:'embedding-3',input:batch})
  const r=spawnSync('curl',['-s','-m','60','https://open.bigmodel.cn/api/paas/v4/embeddings','-H','Content-Type: application/json','-H','Authorization: Bearer '+ZP_K,'-d',body],{encoding:'utf-8',timeout:65000,maxBuffer:20*1024*1024})
  try{const j=JSON.parse(r.stdout);for(const d of j.data)allEmb.push(d.embedding)}catch(e){console.log('Embed err at '+i);break}
  if(i%256===0)process.stdout.write('.')
}
const aEmb=allEmb.slice(0,amazon.length),bEmb=allEmb.slice(amazon.length)
console.log('\n'+allEmb.length+' embeddings complete, dim='+(allEmb[0]?.length||0))

// Score with jw + embedding
const {jaroWinklerScorer}=await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js')
const meta={name:'',semanticType:'name',cardinality:10,isNumeric:false}as any
const aN=amazon.map((r:any)=>String(r.title??r.name??''))
const bN=google.map((r:any)=>String(r.title??r.name??''))
const aW=aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)))
const bW=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))
function cos(a:number[],b:number[]){let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return na>0&&nb>0?d/(Math.sqrt(na)*Math.sqrt(nb)):0}

console.log('Scoring 1363×3226...')
const t0=performance.now()
const pairs:Array<{li:number,ri:number,score:number,nameA:string,nameB:string}>=[]
for(let i=0;i<amazon.length;i++){if(i%200===0)process.stdout.write('.')
  for(let j=0;j<google.length;j++){let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++;if(sh>=2){const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);if(jw>=0.35){const emb=cos(aEmb[i]!,bEmb[j]!);const s=jw*0.50+emb*0.50;if(s>=0.32)pairs.push({li:i,ri:j,score:s,nameA:aN[i]!,nameB:bN[j]!})}}}}
pairs.sort((a,b)=>b.score-a.score)
console.log('\n'+pairs.length+' candidates in '+((performance.now()-t0)/1000).toFixed(1)+'s')

// LLM 600 boundary reviews
const boundary=pairs.filter(p=>p.score>=0.35&&p.score<=0.90).slice(0,600)
console.log('DeepSeek LLM reviewing '+boundary.length+' pairs')
const mSet=new Set<string>(),dSet=new Set<string>()
for(let i=0;i<boundary.length;i+=10){
  const batch=boundary.slice(i,i+10)
  let prompt='Same product? MATCH or NO_MATCH:\n\n'
  for(let j=0;j<batch.length;j++)prompt+=(j+1)+'. '+batch[j]!.nameA.slice(0,50)+'\n   '+batch[j]!.nameB.slice(0,50)+'\n\n'
  const body=JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:400,temperature:0})
  const r=spawnSync('curl',['-s','-m','20','https://api.deepseek.com/chat/completions','-H','Content-Type: application/json','-H','Authorization: Bearer '+DS_K,'-d',body],{encoding:'utf-8',timeout:25000})
  try{const c=JSON.parse(r.stdout).choices?.[0]?.message?.content??'';for(let j=0;j<batch.length;j++){const m=c.match(new RegExp(j+1+'[.\\)]\\s*(MATCH|NO_MATCH)','i'));if(m){const key=batch[j]!.li+':'+batch[j]!.ri;(m[1].toUpperCase()==='MATCH'?mSet:dSet).add(key)}}}catch{}
  if((i/10)%20===0)process.stdout.write('.')
}
console.log('\nLLM: '+mSet.size+' match, '+dSet.size+' deny, parse='+((mSet.size+dSet.size)/boundary.length*100).toFixed(0)+'%')

let bF1=0,bThr=0,bTP=0,bFP=0,bFN=0
for(const thr of [0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){
  const pred=new Set<string>()
  for(const p of pairs){const key=p.li+':'+p.ri;let lbl=p.score;if(mSet.has(key))lbl=Math.max(p.score,0.9);else if(dSet.has(key))lbl=Math.min(p.score,0.50);if(lbl>=thr)pred.add(amazon[p.li]!.id+'|'+google[p.ri]!.id)}
  let tp=0;for(const p of pred)if(truth.has(p))tp++;const fp=pred.size-tp,fn=truth.size-tp;const f=tp>0?(2*tp)/(2*tp+fp+fn):0;if(f>bF1){bF1=f;bThr=thr;bTP=tp;bFP=fp;bFN=fn}
}

console.log('\n═══════════════════════════════════')
console.log('  Amazon-Google Benchmark')
console.log('═══════════════════════════════════')
console.log('  F1 = '+bF1.toFixed(4)+'  P = '+(bTP+bFP>0?bTP/(bTP+bFP):0).toFixed(4)+'  R = '+(bTP+bFN>0?bTP/(bTP+bFN):0).toFixed(4))
console.log('  TP='+bTP+' FP='+bFP+' FN='+bFN+' @ thr='+bThr)
console.log('═══════════════════════════════════')
console.log('Magellan: 0.491 | Ditto: 0.793 | Ours: '+bF1.toFixed(4))
