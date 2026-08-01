import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const OUT = resolve(import.meta.dirname || '.', 'output');
mkdirSync(OUT, { recursive: true });

function loadCsv(path) {
  return JSON.parse(execSync('python3 -c "import pandas as pd,json; d=pd.read_csv(\'' + path + '\',encoding=\'latin1\',dtype=str).fillna(\'\'); recs=[{k:str(v) for k,v in r.items()} for _,r in d.iterrows()]; print(json.dumps(recs))"', { encoding: 'utf-8', maxBuffer: 100*1024*1024 }).trim());
}

function loadMapping(path) {
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.trim().split('\n');
  const pairs = new Set();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 2) pairs.add(parts[0].trim() + '|' + parts[1].trim());
  }
  return pairs;
}

function computeMetrics(predictedPairs, groundTruthPairs, leftRecords, rightRecords, threshold = 0.5) {
  const predSet = new Set();
  for (const p of predictedPairs) {
    if (p.score >= threshold) {
      const ls = leftRecords[p.leftId] && leftRecords[p.leftId].id ? leftRecords[p.leftId].id : String(p.leftId);
      const rs = rightRecords[p.rightId] && rightRecords[p.rightId].id ? rightRecords[p.rightId].id : String(p.rightId);
      predSet.add(ls + '|' + rs);
    }
  }
  let tp = 0;
  for (const pair of predSet) { if (groundTruthPairs.has(pair)) tp++; }
  const p = predSet.size > 0 ? tp / predSet.size : 0;
  const r = groundTruthPairs.size > 0 ? tp / groundTruthPairs.size : 0;
  const f1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
  return { precision: p, recall: r, f1 };
}

async function main() {
  const { runSqlLinkage } = await import(resolve(import.meta.dirname || '.', '../packages/entity-resolver-core/dist/index.js'));
  const { NodeDuckDBBackend } = await import(resolve(import.meta.dirname || '.', '../packages/entity-resolver-node/dist/duckdb-backend.js'));

  const results = [];

  for (const ds of [
    {
      name: 'DBLP-ACM', leftFile: 'benchmarks/datasets/DBLP-ACM/DBLP2.csv',
      rightFile: 'benchmarks/datasets/DBLP-ACM/ACM.csv', mapping: 'benchmarks/datasets/DBLP-ACM/DBLP-ACM_perfectMapping.csv',
      comps: [{ field: 'title', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] }, { field: 'year', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] }],
      blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }, { fields: ['year'], transforms: [] }] }
    },
    {
      name: 'Abt-Buy', leftFile: 'benchmarks/datasets/Abt-Buy/Abt.csv',
      rightFile: 'benchmarks/datasets/Abt-Buy/Buy.csv', mapping: 'benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv',
      comps: [{ field: 'name', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] }, { field: 'price', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] }],
      blocking: { passes: [{ fields: ['name'], transforms: ['lowercase'] }] }
    },
    {
      name: 'Amazon-Google', leftFile: 'benchmarks/datasets/Amazon-Google/Amazon.csv',
      rightFile: 'benchmarks/datasets/Amazon-Google/GoogleProducts.csv&quot;); g=g.rename(columns={&quot;name&quot;:&quot;title&quot;});', mapping: 'benchmarks/datasets/Amazon-Google/Amzon_GoogleProducts_perfectMapping.csv',
      comps: [{ field: 'title', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] }, { field: 'manufacturer', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] }],
      blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }, { fields: ['manufacturer'], transforms: [] }] }
    },
  ]) {
    console.log('=== ' + ds.name + ' ===');
    const leftRecords = loadCsv(ds.leftFile);
    const rightRecords = loadCsv(ds.rightFile);
    const mapping = loadMapping(ds.mapping);
    const be = new NodeDuckDBBackend('/tmp/er_linkage_' + ds.name.replace('-','_') + '.db');
    const t0 = performance.now();
    const result = await runSqlLinkage(leftRecords, rightRecords, { comparisons: ds.comps, blocking: ds.blocking }, be);
    const ms = performance.now() - t0;
    await be.close();
    const metrics = computeMetrics(result.pairs, mapping, leftRecords, rightRecords);
    results.push({ dataset: ds.name, leftRecords: leftRecords.length, rightRecords: rightRecords.length, trueMatches: mapping.size, ...metrics, timeSec: +(ms / 1000).toFixed(1), pairs: result.pairs.length });
    console.log('  F1=' + metrics.f1.toFixed(4) + ' P=' + metrics.precision.toFixed(4) + ' R=' + metrics.recall.toFixed(4) + ' pairs=' + result.pairs.length + ' time=' + (ms/1000).toFixed(1) + 's');
  }

  let splinkResults = [];
  const splinkFile = resolve(OUT, 'splink-results.json');
  if (existsSync(splinkFile)) splinkResults = JSON.parse(readFileSync(splinkFile, 'utf-8'));

  console.log('\n=== Entity Resolution Benchmark — Real Datasets ===');
  console.log('| Dataset | Records | True Matches | F1 | Precision | Recall | Pairs | Time | Splink F1 |');
  console.log('|---------|---------|-------------|------|-----------|--------|-------|------|-----------|');
  for (const r of results) {
    const sp = splinkResults.find(function(s) { return s.dataset === r.dataset; });
    console.log('| ' + r.dataset + ' | ' + (r.leftRecords + r.rightRecords) + ' | ' + r.trueMatches + ' | ' + r.f1.toFixed(4) + ' | ' + r.precision.toFixed(4) + ' | ' + r.recall.toFixed(4) + ' | ' + r.pairs + ' | ' + r.timeSec + 's | ' + (sp ? sp.f1.toFixed(4) : 'N/A') + ' |');
  }

  writeFileSync(resolve(OUT, 'comparison-results.json'), JSON.stringify({ timestamp: new Date().toISOString(), entityResolver: results, splink: splinkResults }, null, 2));
  console.log('\nSaved comparison-results.json');
}

main().catch(function(e) { console.error(e); process.exit(1); });
