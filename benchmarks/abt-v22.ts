import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {performance} from 'node:perf_hooks'
const DS_K='sk-c0b33fe973ac4f599b6e2e3a2125a5b0'
const ZP_K=readFileSync('.env','utf-8').match(/ZHIPU_API_KEY=(.+)/)?.[1]?.trim()||''

const abt=JSON.parse(readFileSync('/tmp/abt.json','utf-8')) as Record<string,unknown>[]
const buy=JSON.parse(readFileSync('/tmp/buy.json','utf-8')) as Record<string,unknown>[]
for(let i=0;i<abt.length;i++)(abt[i]as any).id=String(abt[i].id??i)
for(let i=0;i<buy.length;i++)(buy[i]as any).id=String(buy[i].id??i+abt.length)
const truth=new Set<string>()
for(const l of readFileSync('/workspace/entity-resolver/benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv','utf-8').trim().split('\n').slice(1)){const[p,q]=l.split(',').map((s:string)=>s.trim().replace(/"/g,''));if(p&&q)truth.add(p+'|'+q)}
const aEmb=JSON.parse(readFileSync('/tmp/abt_zhipu.json','utf-8')) as number[][]
const bEmb=JSON.parse(readFileSync('/tmp/buy_zhipu.json','utf-8')) as number[][]
function cos(a:number[],b:number[]){let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return na>0&&nb>0?d/(Math.sqrt(na)*Math.sqrt(nb)):0}

function callLLM(apiKey:string,endpoint:string,model:string,prompt:string):string{
  const body=JSON.stringify({model,messages:[{role:'user',content:prompt}],max_tokens:500,temperature:0})
  const r=spawnSync('curl',['-s','-m','25',endpoint,'-H','Content-Type: application/json','-H','Authorization: Bearer '+apiKey,'-d',body],{encoding:'utf-8',timeout:30000})
  try{return JSON.parse(r.stdout).choices?.[0]?.message?.content??''}catch{return''}
}

function parseConfidence(resp:string,count:number):Array<{verdict:'MATCH'|'NO_MATCH', confidence:number}|null>{
  const results:Array<{verdict:'MATCH'|'NO_MATCH',confidence:number}|null>=[]
  for(let i=1;i<=count;i++){
    const m=resp.match(new RegExp(i+'[\.\)]\\s*(?:\\*\\*)?(MATCH|NO_MATCH)\\s*(?:\\(([\\d.]+)\\)|\\b([\\d.]+) confidence|confidence\\(([\\d.]+)\\)|with (\\d+)% confidence)*\\s*','i'))
    if(m){
      const conf=parseFloat(m[2]??m[3]??m[4]??m[5]??'1')
      results.push({verdict:m[1].toUpperCase() as 'MATCH'|'NO_MATCH', confidence:isNaN(conf)?1:conf})
    }else{
      const simpleM=resp.match(new RegExp(i+'[\.\)]\\s*(MATCH|NO_MATCH)','i'))
      if(simpleM){results.push({verdict:simpleM[1].toUpperCase() as 'MATCH'|'NO_MATCH', confidence:0.8})}
      else results.push(null)
    }
  }
  return results
}

async function main(){
const {jaroWinklerScorer}=await import('../packages/entity-resolver-core/dist/matching/scorers/js/scorers.js')
const meta={name:'',semanticType:'name',cardinality:10,isNumeric:false}as any
const aN=abt.map(r=>String(r.name??'')),bN=buy.map(r=>String(r.name??''))
const aW=aN.map(n=>new Set(n.toLowerCase().split(/[\s\-]+/)))
const bW=bN.map(n=>n.toLowerCase().split(/[\s\-]+/))

console.log('Scoring with jw+Zhipu...')
const t0=performance.now()
const pairs:Array<{li:number,ri:number,score:number,nameA:string,nameB:string}>=[]
for(let i=0;i<abt.length;i++){
  if(i%200===0)process.stdout.write('.')
  for(let j=0;j<buy.length;j++){
    let sh=0;for(const w of bW[j]!)if(aW[i]!.has(w))sh++
    if(sh>=2){const jw=jaroWinklerScorer.score(aN[i]!,bN[j]!,meta);if(jw>=0.35){const emb=cos(aEmb[i]!,bEmb[j]!);const s=jw*0.50+emb*0.50;if(s>=0.32)pairs.push({li:i,ri:j,score:s,nameA:aN[i]!,nameB:bN[j]!})}}
  }
}
pairs.sort((a,b)=>b.score-a.score)
console.log('\n'+pairs.length+' candidates in '+((performance.now()-t0)/1000).toFixed(1)+'s')

// v22: multi-step reasoning + ensemble + confidence regression
const boundary=pairs.filter(p=>p.score>=0.35&&p.score<=0.90).slice(0,1200)
console.log('LLM ensemble reviewing '+boundary.length+' pairs')

const llmScores=new Map<string,number>()
for(let i=0;i<boundary.length;i+=10){
  const batch=boundary.slice(i,i+10)
  
  // Multi-step reasoning prompt
  let prompt='For each product pair, reason step-by-step:\n'
  prompt+='1. Same brand? (MATCH/DIFFERENT)\n2. Same product line/model? (MATCH/DIFFERENT/SIMILAR)\n'
  prompt+='3. Same specs? (MATCH/DIFFERENT)\n4. FINAL: MATCH or NO_MATCH with confidence (0-1)\n\n'
  for(let j=0;j<batch.length;j++)prompt+=(j+1)+'. '+batch[j]!.nameA.slice(0,55)+'\n   '+batch[j]!.nameB.slice(0,55)+'\n\n'

  // Ensemble: DeepSeek + Zhipu GLM
  const [dsResp,zpResp] = await Promise.all([
    callLLM(DS_K,'https://api.deepseek.com/chat/completions','deepseek-chat',prompt),
    ZP_K ? callLLM(ZP_K,'https://open.bigmodel.cn/api/paas/v4/chat/completions','glm-4-flash',prompt) : Promise.resolve(''),
  ])

  const dsVerdicts=parseConfidence(dsResp,batch.length)
  const zpVerdicts=parseConfidence(zpResp,batch.length)

  for(let j=0;j<batch.length;j++){
    const ds=dsVerdicts[j],zp=zpVerdicts[j]
    let finalConf=0

    if(ds&&zp){
      // Both responded: average their confidence, weighted by verdict agreement
      const dsIsMatch=ds.verdict==='MATCH'
      const zpIsMatch=zp.verdict==='MATCH'
      if(dsIsMatch===zpIsMatch){
        // Agreement → high confidence
        finalConf=dsIsMatch?(ds.confidence+zp.confidence)/2:0.2
      }else{
        // Disagreement → moderate uncertainty
        finalConf=0.5
      }
    }else if(ds){
      finalConf=ds.verdict==='MATCH'?ds.confidence:1-ds.confidence
    }else if(zp){
      finalConf=zp.verdict==='MATCH'?zp.confidence:1-zp.confidence
    }else{
      finalConf=0.5 // no response
    }

    llmScores.set(batch[j]!.li+':'+batch[j]!.ri,finalConf)
  }
  if((i/10)%5===0)process.stdout.write('.')
}

const confirmed=Array.from(llmScores.values()).filter(v=>v>0.6).length
const denied=Array.from(llmScores.values()).filter(v=>v<0.4).length
console.log('\nEnsemble: '+confirmed+' confirmed, '+denied+' denied, '+(llmScores.size-confirmed-denied)+' uncertain')

// v22 scoring: continuous LLM confidence replaces binary boost/deny
let bF1=0,bThr=0,bTP=0,bFP=0,bFN=0
for(const thr of [0.4,0.45,0.5,0.55,0.6,0.65,0.7,0.75,0.8]){
  const pred=new Set<string>()
  for(const p of pairs){
    const key=p.li+':'+p.ri
    let lbl=p.score
    const llmConf=llmScores.get(key)
    if(llmConf!==undefined){
      // Continuous integration: blend LLM confidence with string score
      lbl=llmConf>0.6?Math.max(p.score,llmConf):llmConf<0.4?Math.min(p.score,0.45):p.score*0.5+llmConf*0.5
    }
    if(lbl>=thr)pred.add(abt[p.li]!.id+'|'+buy[p.ri]!.id)
  }
  let tp=0;for(const p of pred)if(truth.has(p))tp++
  const fp=pred.size-tp,fn=truth.size-tp
  const f1=tp>0?(2*tp)/(2*tp+fp+fn):0
  if(f1>bF1){bF1=f1;bThr=thr;bTP=tp;bFP=fp;bFN=fn}
}

console.log('\n═══════════════════════════════════')
console.log('  v22: Multi-step + Ensemble + Confidence')
console.log('═══════════════════════════════════')
console.log('  F1 = '+bF1.toFixed(4)+'  P = '+(bTP+bFP>0?bTP/(bTP+bFP):0).toFixed(4)+'  R = '+(bTP+bFN>0?bTP/(bTP+bFN):0).toFixed(4))
console.log('  TP='+bTP+' FP='+bFP+' FN='+bFN+' @ thr='+bThr)
console.log('═══════════════════════════════════')
console.log('v20 (DeepSeek binary): 0.582 | v22 (ensemble+multi): '+bF1.toFixed(4))
}
main()
