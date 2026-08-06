import {readFileSync} from 'node:fs'
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const ZP_K=readFileSync('.env','utf-8').match(/ZHIPU_API_KEY=(.+)/)?.[1]?.trim()||''
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const abt=JSON.parse(readFileSync('/tmp/abt.json','utf-8')) as Record<string,unknown>[]
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const buy=JSON.parse(readFileSync('/tmp/buy.json','utf-8')) as Record<string,unknown>[]
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
for(let i=0;i<abt.length;i++)(abt[i]as any).id=String(abt[i].id??i)
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
for(let i=0;i<buy.length;i++)(buy[i]as any).id=String(buy[i].id??i+abt.length)
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const truth=new Set<string>()
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
for(const l of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)){const[p,q]=l.split(',').map((s:string)=>s.trim().replace(/"/g,''));if(p&&q)truth.add(p+'|'+q)}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const aEmb=JSON.parse(readFileSync('/tmp/abt_zhipu.json','utf-8')) as number[][]
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const bEmb=JSON.parse(readFileSync('/tmp/buy_zhipu.json','utf-8')) as number[][]
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
function verboseParser(raw:string,batch:Array<{leftId:number,rightId:number}>):Array<{leftId:number,rightId:number,verdict:'match'|'deny'}>{
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  const results:Array<{leftId:number,rightId:number,verdict:'match'|'deny'}>=[];for(let i=0;i<batch.length;i++){const m=raw.match(new RegExp(i+1+'[.\\)]\\s*(MATCH|NO_MATCH)','i'));if(m)results.push({leftId:batch[i]!.leftId,rightId:batch[i]!.rightId,verdict:m[1]!.toUpperCase()==='MATCH'?'match':'deny'})}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  return results
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
async function main(){
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const {jaroWinklerScorer}=await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js')
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const {LLMAdapter}=await import('../packages/entity-resolver-node/dist/pipeline/llm-adapter.js')
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const {standardMatchParser,simpleMatchPrompt,fewShotMatchPrompt}=await import('../packages/entity-resolver-core/dist/pipeline/llm-adapter.js')
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const meta={name:'',semanticType:'name',cardinality:10,isNumeric:false}as any
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const aN=abt.map(r=>String(r.name??'')),bN=buy.map(r=>String(r.name??''))
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const aW=aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)))
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const bW=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
function cos(a:number[],b:number[]){let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return na>0&&nb>0?d/(Math.sqrt(na)*Math.sqrt(nb)):0}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const pairs:Array<{li:number,ri:number,score:number,nameA:string,nameB:string}>=[]
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
for(let i=0;i<abt.length;i++)for(let j=0;j<buy.length;j++){let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++;if(sh>=2){const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);if(jw>=0.35){const emb=cos(aEmb[i]!,bEmb[j]!);const s=jw*0.50+emb*0.50;if(s>=0.32)pairs.push({li:i,ri:j,score:s,nameA:aN[i]!,nameB:bN[j]!})}}}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
pairs.sort((a,b)=>b.score-a.score);const boundary=pairs.filter(p=>p.score>=0.35&&p.score<=0.90).slice(0,400)
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
async function runGLM(model:string,parseMode:string,buildPrompt:any,parseResponse:any){
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  const cfg={name:model,endpoint:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model,headers:{'Content-Type':'application/json','Authorization':'Bearer '+ZP_K},maxTokens:parseMode==='verbose'?500:200,temperature:0,batchSize:10,timeoutMs:25000,buildPrompt,parseResponse}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  const adapter=new LLMAdapter(cfg)
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  const verdicts=await adapter.review(boundary.map(p=>({leftId:p.li,rightId:p.ri,leftText:p.nameA,rightText:p.nameB})))
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  const mSet=new Set<string>(),dSet=new Set<string>()
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  for(const v of verdicts){(v.verdict==='match'?mSet:dSet).add(v.leftId+':'+v.rightId)}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  const pr=(mSet.size+dSet.size)/boundary.length
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  let bF1=0;for(const thr of [0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8,0.85]){const pred=new Set<string>();for(const p of pairs){const key=p.li+':'+p.ri;let lbl=p.score;if(mSet.has(key))lbl=Math.max(p.score,0.9);else if(dSet.has(key))lbl=Math.min(p.score,0.50);if(lbl>=thr)pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id)};let tp=0;for(const p of pred)if(truth.has(p))tp++;const fp=pred.size-tp,fn=truth.size-tp;const f=tp>0?(2*tp)/(2*tp+fp+fn):0;if(f>bF1)bF1=f}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  return {f1:bF1,parse:pr*100,matches:mSet.size,denies:dSet.size}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
const tests:{model:string,mode:string,build:any,parse:any}[]=[
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  {model:'glm-4',mode:'fewshot',build:fewShotMatchPrompt(),parse:standardMatchParser()},
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  {model:'glm-4-0520',mode:'fewshot',build:fewShotMatchPrompt(),parse:standardMatchParser()},
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  {model:'glm-4-flash',mode:'fewshot',build:fewShotMatchPrompt(),parse:standardMatchParser()},
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  {model:'glm-4-flash',mode:'simple',build:simpleMatchPrompt(),parse:standardMatchParser()},
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  {model:'}},
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
]
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},

  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
console.log('Model        | Mode    | Parse | Match/Deny | F1')
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
console.log('-------------|---------|-------|------------|------')
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
for(const t of tests){
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  const r=await runGLM(t.model,t.mode,t.build as any,t.parse as any)
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
  console.log(t.model.padEnd(13)+'| '+t.mode.padEnd(8)+'| '+(r.parse as number).toFixed(0)+'%  | '+r.matches+'/'+r.denies+'      | '+r.f1.toFixed(4))
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
console.log('\nDeepSeek-v4-flash (adapter, 400 reviews): 0.491')
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
console.log('DeepSeek-v4-flash (hand-tuned, 2400 reviews): 0.582')
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
}
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
main()
  {model:"glm-4-plus",mode:"hand-tuned",build:simpleMatchPrompt(),parse:standardMatchParser()},
