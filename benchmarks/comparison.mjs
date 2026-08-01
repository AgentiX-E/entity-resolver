/**
 * Verified Real Dataset Benchmark — entity-resolver accuracy with ground truth.
 * 
 * Results (2026-08-01):
 *   DBLP-ACM: F1=0.9362 P=0.9415 R=0.9310 (2,224 true matches from 4,910 records)
 *   Abt-Buy:  F1=0.0055 P=1.0000 R=0.0027 (1,097 true matches from 2,173 records)
 *   Amazon-Google: Requires column normalization (GoogleProducts.csv name->title),
 *     then same pipeline as DBLP-ACM produces ~600K candidate pairs.
 *
 * Usage: node benchmarks/comparison.mjs
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const OUT = resolve(import.meta.dirname || '.', 'output');
mkdirSync(OUT, { recursive: true });

function loadCsv(path) { return JSON.parse(execSync('python3 -c "import pandas as pd,json; d=pd.read_csv(\'' + path + '\',encoding=\'latin1\',dtype=str).fillna(\'\'); recs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]; print(json.dumps(recs))"', { encoding:'utf-8', maxBuffer:100*1024*1024 }).trim()); }
function loadMapping(path) { var r=readFileSync(path,'utf-8'),l=r.trim().split('\n'),s=new Set(); for(var i=1;i<l.length;i++){var p=l[i].split(',');if(p.length>=2)s.add(p[0].trim().replace(/"/g,'')+'|'+p[1].trim().replace(/"/g,''));} return s; }

function computeMetrics(pairs, truth, left, right, threshold) {
  threshold = threshold || 0.3; var pred = new Set();
  for (var i=0;i<pairs.length;i++) { var p=pairs[i]; if (p.score>=threshold) { var ls=(left[p.leftId]&&left[p.leftId].id)?left[p.leftId].id:String(p.leftId); var rs=(right[p.rightId]&&right[p.rightId].id)?right[p.rightId].id:String(p.rightId); pred.add(ls+'|'+rs); } }
  var tp=0; var arr=Array.from(pred); for(var j=0;j<arr.length;j++){if(truth.has(arr[j]))tp++;}
  var pr=pred.size>0?tp/pred.size:0, rc=truth.size>0?tp/truth.size:0, f1=pr+rc>0?(2*pr*rc)/(pr+rc):0;
  return {precision:pr, recall:rc, f1:f1};
}

async function main() {
  var {runSqlLinkage}=await import(resolve(import.meta.dirname||'.','../packages/entity-resolver-core/dist/index.js'));
  var {NodeDuckDBBackend}=await import(resolve(import.meta.dirname||'.','../packages/entity-resolver-node/dist/duckdb-backend.js'));
  var results=[];

  // DBLP-ACM: title blocking, multi-level jaro_winkler
  console.log('=== DBLP-ACM ===');
  var dL=loadCsv('benchmarks/datasets/DBLP-ACM/DBLP2.csv'), dR=loadCsv('benchmarks/datasets/DBLP-ACM/ACM.csv'), dM=loadMapping('benchmarks/datasets/DBLP-ACM/DBLP-ACM_perfectMapping.csv');
  var dB=new NodeDuckDBBackend('/tmp/er_dblp.db'), t0=performance.now();
  var dRes=await runSqlLinkage(dL,dR,{comparisons:[{field:'title',scorerName:'jaro_winkler',levels:[{name:'strong_match',threshold:0.95},{name:'moderate_match',threshold:0.8},{name:'weak_match',threshold:0.6}]},{field:'year',scorerName:'jaro_winkler',levels:[{name:'match'}]}],blocking:{passes:[{fields:['title'],transforms:['lowercase']}]}},dB);
  var dMs=performance.now()-t0; dB.close();
  var dMtr=computeMetrics(dRes.pairs,dM,dL,dR,0.3);
  results.push({dataset:'DBLP-ACM',records:dL.length+dR.length,trueMatches:dM.size,...dMtr,timeSec:+(dMs/1000).toFixed(1),pairs:dRes.pairs.length});
  console.log('  F1='+dMtr.f1.toFixed(4)+' P='+dMtr.precision.toFixed(4)+' R='+dMtr.recall.toFixed(4)+' pairs='+dRes.pairs.length+' time='+(dMs/1000).toFixed(1)+'s');

  // Abt-Buy: name+price blocking
  console.log('=== Abt-Buy ===');
  var aL=loadCsv('benchmarks/datasets/Abt-Buy/Abt.csv'), aR=loadCsv('benchmarks/datasets/Abt-Buy/Buy.csv'), aM=loadMapping('benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv');
  var aB=new NodeDuckDBBackend('/tmp/er_abt.db'); t0=performance.now();
  var aRes=await runSqlLinkage(aL,aR,{comparisons:[{field:'name',scorerName:'jaro_winkler',levels:[{name:'strong_match',threshold:0.95},{name:'moderate_match',threshold:0.7},{name:'weak_match',threshold:0.4}]},{field:'price',scorerName:'jaro_winkler',levels:[{name:'match'}]}],blocking:{passes:[{fields:['name'],transforms:['lowercase']}]}},aB);
  var aMs=performance.now()-t0; aB.close();
  var aMtr=computeMetrics(aRes.pairs,aM,aL,aR,0.3);
  results.push({dataset:'Abt-Buy',records:aL.length+aR.length,trueMatches:aM.size,...aMtr,timeSec:+(aMs/1000).toFixed(1),pairs:aRes.pairs.length});
  console.log('  F1='+aMtr.f1.toFixed(4)+' P='+aMtr.precision.toFixed(4)+' R='+aMtr.recall.toFixed(4)+' pairs='+aRes.pairs.length+' time='+(aMs/1000).toFixed(1)+'s');

  // Report
  var splink=[]; var sf=resolve(OUT,'splink-results.json'); if(existsSync(sf)) splink=JSON.parse(readFileSync(sf,'utf-8'));
  console.log('\n=== Verified Entity Resolution Benchmark ===');
  console.log('| Dataset | Records | True | F1 | Precision | Recall | Pairs | Time | Splink F1 |');
  console.log('|---------|---------|------|------|-----------|--------|-------|------|-----------|');
  for(var ri=0;ri<results.length;ri++){var r=results[ri];var sp=splink.find(function(s){return s.dataset===r.dataset;});console.log('| '+r.dataset+' | '+r.records+' | '+r.trueMatches+' | '+r.f1.toFixed(4)+' | '+r.precision.toFixed(4)+' | '+r.recall.toFixed(4)+' | '+r.pairs+' | '+r.timeSec+'s | '+(sp?sp.f1.toFixed(4):'N/A')+' |');}
  writeFileSync(resolve(OUT,'comparison-results.json'),JSON.stringify({timestamp:new Date().toISOString(),entityResolver:results,splink:splink},null,2));
  console.log('\nSaved comparison-results.json');
}
main().catch(function(e){console.error(e);process.exit(1);});
