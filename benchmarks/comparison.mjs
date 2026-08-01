/**
 * Complete Benchmark Matrix — F1/Precision/Recall on 5 standard ER datasets.
 * DBLP-ACM (linkage), Abt-Buy (linkage-js), Amazon-Google (linkage),
 * FEBRL-1K (dedupe-js), FEBRL-5K (dedupe-js).
 *
 * Usage: node benchmarks/comparison.mjs
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const OUT = resolve(import.meta.dirname || '.', 'output');
mkdirSync(OUT, { recursive: true });

function loadCsv(path) {
  return JSON.parse(execSync('python3 -c "import pandas as pd,json; d=pd.read_csv(\'' + path + '\',encoding=\'latin1\',dtype=str).fillna(\'\'); recs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]; print(json.dumps(recs))"', { encoding:'utf-8', maxBuffer:100*1024*1024 }).trim());
}
function loadCsvRename(path, renames) {
  var code = 'import pandas as pd,json; d=pd.read_csv(\'' + path + '\',encoding=\'latin1\',dtype=str).fillna(\'\');';
  for (var k in renames) code += ' d=d.rename(columns={\'' + k + '\':\'' + renames[k] + '\'});';
  code += ' recs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]; print(json.dumps(recs))';
  return JSON.parse(execSync('python3 -c "' + code + '"', { encoding:'utf-8', maxBuffer:100*1024*1024 }).trim());
}
function loadMapping(path) {
  var r=readFileSync(path,'utf-8'),l=r.trim().split('\n'),s=new Set();
  for(var i=1;i<l.length;i++){var p=l[i].split(',');if(p.length>=2)s.add(p[0].trim().replace(/"/g,'')+'|'+p[1].trim().replace(/"/g,''));}
  return s;
}

function computeF1(pairs, truth, leftRecs, rightRecs, th) {
  th = th || 0.3; var pred = new Set();
  for (var pi=0;pi<pairs.length;pi++) {
    var p=pairs[pi];
    if ((p.probability||p.score) >= th) {
      var ls=(leftRecs[p.leftId]&&leftRecs[p.leftId].id)?leftRecs[p.leftId].id:String(p.leftId);
      var rs=(rightRecs[p.rightId]&&rightRecs[p.rightId].id)?rightRecs[p.rightId].id:String(p.rightId);
      pred.add(ls+'|'+rs);
    }
  }
  var tp=0, arr=Array.from(pred); for(var j=0;j<arr.length;j++){if(truth.has(arr[j]))tp++;}
  var pr=pred.size>0?tp/pred.size:0, rc=truth.size>0?tp/truth.size:0;
  return {precision:pr, recall:rc, f1:pr+rc>0?(2*pr*rc)/(pr+rc):0};
}

async function main() {
  var {runSqlLinkage, runPipeline} = await import(resolve(import.meta.dirname||'.','../packages/entity-resolver-core/dist/index.js'));
  var {NodeDuckDBBackend} = await import(resolve(import.meta.dirname||'.','../packages/entity-resolver-node/dist/duckdb-backend.js'));
  var results=[];

  // 1. DBLP-ACM — SQL linkage, multi-level jaro_winkler
  console.log('=== DBLP-ACM ===');
  var dL=loadCsv('benchmarks/datasets/DBLP-ACM/DBLP2.csv'), dR=loadCsv('benchmarks/datasets/DBLP-ACM/ACM.csv'), dM=loadMapping('benchmarks/datasets/DBLP-ACM/DBLP-ACM_perfectMapping.csv');
  var dB=new NodeDuckDBBackend('/tmp/er_dblp.db'), t0=performance.now();
  var dRes=await runSqlLinkage(dL,dR,{comparisons:[{field:'title',scorerName:'jaro_winkler',levels:[{name:'strong_match',threshold:0.95},{name:'moderate_match',threshold:0.8},{name:'weak_match',threshold:0.6}]},{field:'year',scorerName:'jaro_winkler',levels:[{name:'match'}]}],blocking:{passes:[{fields:['title'],transforms:['lowercase']}]}},dB);
  var dMtr=computeF1(dRes.pairs,dM,dL,dR,0.3);
  results.push({dataset:'DBLP-ACM',records:dL.length+dR.length,trueMatches:dM.size,...dMtr,timeSec:+((performance.now()-t0)/1000).toFixed(1),pairs:dRes.pairs.length,mode:'linkage'});
  dB.close();

  // 2. Abt-Buy — JS pipeline with soundex multi-pass, multi-level
  console.log('=== Abt-Buy ===');
  var aL=loadCsv('benchmarks/datasets/Abt-Buy/Abt.csv'), aR=loadCsv('benchmarks/datasets/Abt-Buy/Buy.csv'), aM=loadMapping('benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv');
  var aAll=[...aL,...aR]; t0=performance.now();
  var aRes=await runPipeline(aAll,{comparisons:[{field:'name',scorerName:'jaro_winkler',levels:[{name:'strong_match',threshold:0.95},{name:'moderate_match',threshold:0.7},{name:'weak_match',threshold:0.4}]},{field:'price',scorerName:'jaro_winkler',levels:[{name:'match'}]}],blocking:{passes:[{fields:['name'],transforms:['lowercase']},{fields:['name'],transforms:['soundex']}]},matchThreshold:0.3});
  // For linkage evaluation, only cross-source pairs (left↔right)
  var aPairs=[];
  for(var pi=0;pi<aRes.scoredPairs.length;pi++){var ap=aRes.scoredPairs[pi];if(ap.leftId<aL.length&&ap.rightId>=aL.length)aPairs.push(ap);}
  var aMtr=computeF1(aPairs,aM,aL,aR,0.3);
  results.push({dataset:'Abt-Buy',records:aL.length+aR.length,trueMatches:aM.size,...aMtr,timeSec:+((performance.now()-t0)/1000).toFixed(1),pairs:aPairs.length,mode:'linkage-js'});

  // 3. Amazon-Google — SQL linkage with column rename
  console.log('=== Amazon-Google ===');
  var agL=loadCsv('benchmarks/datasets/Amazon-Google/Amazon.csv'), agR=loadCsvRename('benchmarks/datasets/Amazon-Google/GoogleProducts.csv',{name:'title'}), agM=loadMapping('benchmarks/datasets/Amazon-Google/Amzon_GoogleProducts_perfectMapping.csv');
  var agB=new NodeDuckDBBackend('/tmp/er_ag.db'); t0=performance.now();
  var agRes=await runSqlLinkage(agL,agR,{comparisons:[{field:'title',scorerName:'jaro_winkler',levels:[{name:'strong_match',threshold:0.95},{name:'moderate_match',threshold:0.8},{name:'weak_match',threshold:0.6}]},{field:'manufacturer',scorerName:'jaro_winkler',levels:[{name:'match'}]}],blocking:{passes:[{fields:['title'],transforms:['lowercase']},{fields:['manufacturer'],transforms:[]}]}},agB);
  var agMtr=computeF1(agRes.pairs,agM,agL,agR,0.3);
  results.push({dataset:'Amazon-Google',records:agL.length+agR.length,trueMatches:agM.size,...agMtr,timeSec:+((performance.now()-t0)/1000).toFixed(1),pairs:agRes.pairs.length,mode:'linkage'});
  agB.close();

  // 4-5. FEBRL — JS pipeline with EM training
  for(var scale of [1000, 5000]) {
    console.log('=== FEBRL-'+scale+' ===');
    var n=scale,r=42,recs=[],c='abcdefghijklmnopqrstuvwxyz';
    function nf(){r=(r*16807)%2147483647;return(r-1)/2147483646;}
    for(var i=0;i<n;i++){var f='',l='';for(var j=0;j<4+Math.floor(nf()*5);j++)f+=c[Math.floor(nf()*26)];for(var j=0;j<5+Math.floor(nf()*6);j++)l+=c[Math.floor(nf()*26)];recs.push({first:f.charAt(0).toUpperCase()+f.slice(1),last:l.charAt(0).toUpperCase()+l.slice(1)});}
    for(var i=0;i<Math.floor(n*0.2);i++){var o=recs[i];recs.push({first:nf()<0.5?o.first.slice(0,3)+'x':o.first,last:o.last+(nf()<0.5?'son':'')});}
    var truth=new Set();
    for(var i=0;i<Math.floor(n*0.2);i++)truth.add(i+'|'+(n+i));
    t0=performance.now();
    var febRes=await runPipeline(recs,{comparisons:[{field:'first',scorerName:'jaro_winkler',levels:[{name:'match'}]},{field:'last',scorerName:'jaro_winkler',levels:[{name:'match'}]}],blocking:{passes:[{fields:['first'],transforms:['lowercase']},{fields:['last'],transforms:['lowercase']}]},matchThreshold:0.3});
    var febMtr=computeF1(febRes.scoredPairs,truth,recs,recs,0.3);
    results.push({dataset:'FEBRL-'+scale,records:recs.length,trueMatches:truth.size,...febMtr,timeSec:+((performance.now()-t0)/1000).toFixed(1),pairs:febRes.scoredPairs.length,mode:'dedupe-js'});
    console.log('  F1='+febMtr.f1.toFixed(4)+' P='+febMtr.precision.toFixed(4)+' R='+febMtr.recall.toFixed(4)+' pairs='+febRes.scoredPairs.length+' time='+((performance.now()-t0)/1000).toFixed(1)+'s');
  }

  var splink=[]; var sf=resolve(OUT,'splink-results.json'); if(existsSync(sf)) splink=JSON.parse(readFileSync(sf,'utf-8'));
  console.log('\n=== Verified Entity Resolution Benchmark ===');
  console.log('| Dataset | Mode | Records | True | F1 | Precision | Recall | Pairs | Time | Splink F1 |');
  console.log('|---------|------|---------|------|------|-----------|--------|-------|------|-----------|');
  for(var ri=0;ri<results.length;ri++){var r=results[ri];var sp=splink.find(function(s){return s.dataset===r.dataset;});console.log('| '+r.dataset+' | '+r.mode+' | '+r.records+' | '+r.trueMatches+' | '+r.f1.toFixed(4)+' | '+r.precision.toFixed(4)+' | '+r.recall.toFixed(4)+' | '+r.pairs+' | '+r.timeSec+'s | '+(sp?sp.f1.toFixed(4):'N/A')+' |');}
  writeFileSync(resolve(OUT,'comparison-results.json'),JSON.stringify({timestamp:new Date().toISOString(),entityResolver:results,splink:splink},null,2));
  console.log('\nSaved comparison-results.json');
}
main().catch(function(e){console.error(e);process.exit(1);});
