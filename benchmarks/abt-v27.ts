import {readFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
const DS_K='sk-c0b33fe973ac4f599b6e2e3a2125a5b0'

const abt=JSON.parse(readFileSync('/tmp/abt.json','utf-8')) as Record<string,unknown>[]
const buy=JSON.parse(readFileSync('/tmp/buy.json','utf-8')) as Record<string,unknown>[]
for(let i=0;i<abt.length;i++)(abt[i]as any).id=String(abt[i].id??i)
for(let i=0;i<buy.length;i++)(buy[i]as any).id=String(buy[i].id??i+abt.length)
const truth=new Set<string>()
for(const l of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)){const[p,q]=l.split(',').map((s:string)=>s.trim().replace(/"/g,''));if(p&&q)truth.add(p+'|'+q)}
const aEmb=JSON.parse(readFileSync('/tmp/abt_zhipu.json','utf-8')) as number[][]
const bEmb=JSON.parse(readFileSync('/tmp/buy_zhipu.json','utf-8')) as number[][]
function cos(a:number[],b:number[]){let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return na>0&&nb>0?d/(Math.sqrt(na)*Math.sqrt(nb)):0}

async function run(configName:string, llmAdapter:any){
  const {jaroWinklerScorer}=await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js')
  const meta={name:'',semanticType:'name',cardinality:10,isNumeric:false}as any;const aN=abt.map(r=>String(r.name??'')),bN=buy.map(r=>String(r.name??''))
  const aW=aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)));const bW=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))

  console.log('\n=== '+configName+' ===')
  const pairs:Array<{li:number,ri:number,score:number,nameA:string,nameB:string}>=[]
  for(let i=0;i<abt.length;i++){for(let j=0;j<buy.length;j++){let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++;if(sh>=2){const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);if(jw>=0.35){const emb=cos(aEmb[i]!,bEmb[j]!);const s=jw*0.50+emb*0.50;if(s>=0.32)pairs.push({li:i,ri:j,score:s,nameA:aN[i]!,nameB:bN[j]!})}}}}
  pairs.sort((a,b)=>b.score-a.score);console.log(pairs.length+' candidates')

  const boundary=pairs.filter(p=>p.score>=0.35&&p.score<=0.90).slice(0,400)
  console.log('Reviewing '+boundary.length+' pairs...')
  const llmVerdicts=await llmAdapter.review(boundary.map(p=>({leftId:p.li,rightId:p.ri,leftText:p.nameA,rightText:p.nameB})))
  const matchSet=new Set<string>(),denySet=new Set<string>()
  for(const v of llmVerdicts){const key=v.leftId+':'+v.rightId;(v.verdict==='match'?matchSet:denySet).add(key)}
  console.log('Match: '+matchSet.size+' Deny: '+denySet.size+' Parse rate: '+((matchSet.size+denySet.size)/boundary.length*100).toFixed(0)+'%')

  let bF1=0,bThr=0,bTP=0,bFP=0,bFN=0
  for(const thr of [0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){
    const pred=new Set<string>()
    for(const p of pairs){const key=p.li+':'+p.ri;let lbl=p.score;if(matchSet.has(key))lbl=Math.max(p.score,0.9);else if(denySet.has(key))lbl=Math.min(p.score,0.50);if(lbl>=thr)pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id)}
    let tp=0;for(const p of pred)if(truth.has(p))tp++;const fp=pred.size-tp,fn=truth.size-tp;const f=tp>0?(2*tp)/(2*tp+fp+fn):0;if(f>bF1){bF1=f;bThr=thr;bTP=tp;bFP=fp;bFN=fn}
  }
  console.log('F1='+bF1.toFixed(4)+' P='+(bTP+bFP>0?bTP/(bTP+bFP):0).toFixed(4)+' R='+(bTP+bFN>0?bTP/(bTP+bFN):0).toFixed(4)+' TP='+bTP+' @ thr='+bThr)
  return bF1
}

// DeepSeek config
const {deepSeekV4FlashConfig,glm4Config,LLMAdapter}=await import('../packages/entity-resolver-node/dist/pipeline/llm-adapter.js')
const dsCfg=deepSeekV4FlashConfig(DS_K)
const dsF1=await run('DeepSeek-v4-flash (model-agnostic adapter)',new LLMAdapter(dsCfg))

// GLM-4 config  
const ZP_K=readFileSync('.env','utf-8').match(/ZHIPU_API_KEY=(.+)/)?.[1]?.trim()||''
const glmCfg=glm4Config(ZP_K)
const glmF1=await run('GLM-4-0520 (model-agnostic adapter)',new LLMAdapter(glmCfg))

console.log('\n═══════════════════════════════════')
console.log('  v27: Model-Agnostic LLM Adapter')
console.log('═══════════════════════════════════')
console.log('  DeepSeek: '+dsF1.toFixed(4)+' | GLM-4: '+glmF1.toFixed(4))
console.log('  Winner: '+(dsF1>glmF1?'DeepSeek':'GLM-4'))
console.log('═══════════════════════════════════')
