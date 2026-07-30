/**
 * Leipzig dataset benchmark — entity-resolver SQL pipeline
 *
 * Runs ER against DBLP-ACM, Amazon-Google, Abt-Buy standard datasets.
 * Compares pair counts with Splink results for correctness verification.
 *
 * Usage: node benchmarks/leipzig.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const OUT = resolve(import.meta.dirname || '.', 'output');

async function main() {
  const { runPipeline } = await import('/workspace/entity-resolver/packages/entity-resolver-core/dist/index.js');
  const { NodeDuckDBBackend } = await import('/workspace/entity-resolver/packages/entity-resolver-node/dist/duckdb-backend.js');

  mkdirSync(OUT, { recursive: true });

  // ─── DBLP-ACM ──────────────────────────────────────────────────
  const dblpResult = await runDataset(
    'DBLP-ACM',
    () => {
      // Read CSV via Python for reliable encoding
      const py = 'import pandas as pd; d=pd.read_csv("benchmarks/datasets/DBLP-ACM/DBLP2.csv",encoding="latin1").fillna(""); a=pd.read_csv("benchmarks/datasets/DBLP-ACM/ACM.csv",encoding="latin1").fillna(""); import json; recs = []; [recs.append({"source":"dblp","id":str(r["id"]),"title":str(r["title"]),"authors":str(r["authors"]),"venue":str(r["venue"]),"year":str(r["year"])}) for _,r in d.iterrows()]; [recs.append({"source":"acm","id":str(r["id"]),"title":str(r["title"]),"authors":str(r["authors"]),"venue":str(r["venue"]),"year":str(r["year"])}) for _,r in a.iterrows()]; print(json.dumps(recs))';
      return JSON.parse(execSync(`python3 -c '${py}'`, { encoding: 'utf-8', maxBuffer: 50*1024*1024 }).trim());
    },
    {
      comparisons: [
        { field: 'title', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
        { field: 'year', scorerName: 'exact', levels: [{ name: 'match' }] },
      ],
      blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }, { fields: ['year'], transforms: [] }] },
    },
    runPipeline, NodeDuckDBBackend,
  );

  // ─── Amazon-Google ─────────────────────────────────────────────
  const agResult = await runDataset(
    'Amazon-Google',
    () => {
      const py = 'import pandas as pd, json; a=pd.read_csv("benchmarks/datasets/Amazon-Google/Amazon.csv",encoding="latin1").fillna(""); g=pd.read_csv("benchmarks/datasets/Amazon-Google/GoogleProducts.csv",encoding="latin1").fillna(""); g.rename(columns={"name":"title"},inplace=True); recs=[];[recs.append({"source":"amazon","id":str(r["id"]),"title":str(r["title"]),"manufacturer":str(r["manufacturer"]),"price":str(r["price"])}) for _,r in a.iterrows()];[recs.append({"source":"google","id":str(r["id"]),"title":str(r["title"]),"manufacturer":str(r["manufacturer"]),"price":str(r["price"])}) for _,r in g.iterrows()];print(json.dumps(recs))';
      return JSON.parse(execSync(`python3 -c '${py}'`, { encoding: 'utf-8', maxBuffer: 50*1024*1024 }).trim());
    },
    {
      comparisons: [
        { field: 'title', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
        { field: 'manufacturer', scorerName: 'exact', levels: [{ name: 'match' }] },
      ],
      blocking: { passes: [{ fields: ['title'], transforms: ['lowercase'] }, { fields: ['manufacturer'], transforms: [] }] },
    },
    runPipeline, NodeDuckDBBackend,
  );

  // ─── Output ────────────────────────────────────────────────────
  const allResults = [dblpResult, agResult];

  console.log('\n=== Leipzig Benchmark Results ===');
  console.log('| Dataset | Records | ER SQL | ER pairs | Splink | Splink pairs |');
  console.log('|---------|---------|--------|----------|--------|-------------|');

  // Load Splink results for comparison
  let splinkResults = [];
  const splinkFile = resolve(OUT, 'leipzig-results.json');
  if (existsSync(splinkFile)) {
    splinkResults = JSON.parse(readFileSync(splinkFile, 'utf-8'));
  }

  for (const r of allResults) {
    const sp = splinkResults.find(s => s.dataset === r.dataset);
    console.log('|', r.dataset, '|', r.records, '|', r.timeSec + 's', '|', r.pairs, '|', sp ? sp.timeSec + 's' : 'N/A', '|', sp?.pairs ?? 'N/A', '|');
  }

  // Save
  const allData = [...allResults];
  if (splinkResults.length > 0) allData.push(...splinkResults);
  writeFileSync(resolve(OUT, 'leipzig-full.json'), JSON.stringify(allData, null, 2));
  console.log('\nSaved leipzig-full.json');
}

async function runDataset(name, loadFn, config, runPipeline, NodeDuckDBBackend) {
  const records = loadFn();
  console.log(`\n=== ${name} (${records.length} records) ===`);

  const be = new NodeDuckDBBackend('/tmp/er_leipzig_' + name + '.db');
  const t0 = performance.now();
  const result = await runPipeline(records, config, { sqlBackend: be });
  const ms = performance.now() - t0;
  await be.close();

  console.log(`  entity-resolver: ${(ms/1000).toFixed(1)}s, ${result.scoredPairs?.length ?? 0} pairs`);
  return { dataset: name, engine: 'entity-resolver-sql', records: records.length, timeMs: Math.round(ms), timeSec: (ms/1000).toFixed(1), pairs: result.scoredPairs?.length ?? 0 };
}

main().catch(e => { console.error(e); process.exit(1); });
