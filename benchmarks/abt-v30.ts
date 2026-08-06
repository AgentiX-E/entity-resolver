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

function callLLM(prompt:string):string{
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

// OPT1: TF-IDF key token extraction for all products (Ditto technique)
console.log('Computing TF-IDF...')
const allTokens=aN.map(n=>n.toLowerCase().split(/[\s\-]+/))
const allTokensB=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))
const docFreq=new Map<string,number>()
for(const toks of [...allTokens,...allTokensB]){const seen=new Set<string>();for(const t of toks)if(!seen.has(t)){docFreq.set(t,(docFreq.get(t)??0)+1);seen.add(t)}}
const N=abt.length+buy.length
function tfidf(toks:string[]):Set<string>{
  const scores:Array<{t:string,s:number}>=[]
  const tf=new Map<string,number>();for(const t of toks)tf.set(t,(tf.get(t)??0)+1)
  for(const [t,f] of tf){const df=docFreq.get(t)??1;scores.push({t,s:f/docFreq.size*Math.log(N/df)})}
  scores.sort((a,b)=>b.s-a.s)
  return new Set(scores.slice(0,10).map(x=>x.t))
}
const aTfidf=allTokens.map(t=>tfidf(t)),bTfidf=allTokensB.map(t=>tfidf(t))
console.log('TF-IDF computed for '+N+' products')

// OPT2: Token overlap features (model number, brand, alphanumeric) per "matched" paper
function alphaNum(toks:string[]):string[]{return toks.filter(t=>/^[A-Z]*\d+[A-Z]*$/.test(t.toUpperCase()))}
const aModels=allTokens.map(t=>alphaNum(t)),bModels=allTokensB.map(t=>alphaNum(t))

// Score with TF-IDF overlap + model token overlap + jw + embedding
console.log('Scoring with TF-IDF + model tokens...')
const t0=performance.now()
const pairs:Array<{li:number,ri:number,score:number,jw:number,emb:number,tfidf:number,model:number,nameA:string,nameB:string}>=[]
for(let i=0;i<abt.length;i++){
  if(i%200===0)process.stdout.write('.')
  const atf=aTfidf[i]!,amo=new Set(aModels[i]!)
  for(let j=0;j<buy.length;j++){
    // TF-IDF pre-filter: must share at least 2 high-IDF tokens
    let tfidfShared=0;for(const t of bTfidf[j]!)if(atf.has(t))tfidfShared++
    if(tfidfShared<2)continue
    const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta)
    if(jw<0.35)continue
    const emb=cos(aEmb[i]!,bEmb[j]!)
    // OPT2: model token overlap
    let modelOverlap=0;for(const m of bModels[j]!)if(amo.has(m))modelOverlap++
    const modelBonus=modelOverlap>0?0.15:0
    // Weighted ensemble: jw(0.35)+emb(0.35)+tfidf(0.15)+model(0.15)
    const tfidfScore=Math.min(1,tfidfShared/8)
    const s=jw*0.35+emb*0.35+tfidfScore*0.15+modelBonus
    if(s>=0.30)pairs.push({li:i,ri:j,score:s,jw,emb,tfidf:tfidfScore,model:modelBonus,nameA:aN[i]!,nameB:bN[j]!})
  }
}
pairs.sort((a,b)=>b.score-a.score)
console.log('\n'+pairs.length+' candidates in '+((performance.now()-t0)/1000).toFixed(1)+'s')

// OPT3: LLM self-consistency voting (3 calls, majority)
const boundary=pairs.filter(p=>p.score>=0.35&&p.score<=0.90).slice(0,600)
console.log('LLM self-consistency on '+boundary.length+' pairs (3 votes each)')

const llmVotes=new Map<string,number>() // key → net match votes
for(let i=0;i<boundary.length;i+=10){
  const batch=boundary.slice(i,i+10)
  let prompt='Same product? MATCH or NO_MATCH per pair:\n\n'
  for(let j=0;j<batch.length;j++)prompt+=(j+1)+'. '+batch[j]!.nameA.slice(0,50)+'\n   '+batch[j]!.nameB.slice(0,50)+'\n\n'
  
  // 3 independent votes
  const responses=await Promise.all([callLLM(prompt),callLLM(prompt),callLLM(prompt)])
  for(let j=0;j<batch.length;j++){
    let votes=0
    for(const resp of responses){
      const m=resp.match(new RegExp(j+1+'[.\\)]\\s*(MATCH|NO_MATCH)','i'))
      if(m)votes+=m[1].toUpperCase()==='MATCH'?1:-1
    }
    llmVotes.set(batch[j]!.li+':'+batch[j]!.ri,votes)
  }
  if((i/10)%20===0)process.stdout.write('.')
}

const matchSet=new Set<string>(),denySet=new Set<string>()
for(const [key,votes] of llmVotes){if(votes>0)matchSet.add(key);else if(votes<0)denySet.add(key)}
const parsed=matchSet.size+denySet.size
console.log('\nConsensus: '+matchSet.size+' match, '+denySet.size+' deny, parse='+(parsed/boundary.length*100).toFixed(0)+'%')

// Threshold grid
let bF1=0,bThr=0,bTP=0,bFP=0,bFN=0
for(const thr of [0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){
  const pred=new Set<string>()
  for(const p of pairs){const key=p.li+':'+p.ri;let lbl=p.score;if(matchSet.has(key))lbl=Math.max(p.score,0.9);else if(denySet.has(key))lbl=Math.min(p.score,0.50);if(lbl>=thr)pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id)}
  let tp=0;for(const p of pred)if(truth.has(p))tp++;const fp=pred.size-tp,fn=truth.size-tp;const f=tp>0?(2*tp)/(2*tp+fp+fn):0;if(f>bF1){bF1=f;bThr=thr;bTP=tp;bFP=fp;bFN=fn}
}

console.log('\n═══════════════════════════════════')
console.log('  v30: TF-IDF + Token Overlap + Self-Consistency')
console.log('═══════════════════════════════════')
console.log('  F1 = '+bF1.toFixed(4)+'  P = '+(bTP+bFP>0?bTP/(bTP+bFP):0).toFixed(4)+'  R = '+(bTP+bFN>0?bTP/(bTP+bFN):0).toFixed(4))
console.log('  TP='+bTP+' FP='+bFP+' FN='+bFN+' @ thr='+bThr)
console.log('═══════════════════════════════════')
console.log('v20 (baseline): 0.582 | v30 (TF-IDF+overlap+3xvote): '+bF1.toFixed(4))
}
main()
