/**
 * Entity Resolver Benchmark Runner
 *
 * Tests entity-resolver against Splink on synthetically generated
 * data across multiple scales, plus standard academic datasets.
 *
 * Usage: node benchmarks/run.mjs [10K|100K|1M]
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const OUT = resolve(import.meta.dirname || '.', 'output');
mkdirSync(OUT, { recursive: true });

const scale = process.argv[2] || '100K';
const SIZE_MAP = { '10K': 10000, '100K': 100000, '1M': 1000000 };
const N = SIZE_MAP[scale] || 100000;
const dupRate = 0.2;
const CHARS = 'abcdefghijklmnopqrstuvwxyz';

function genName(len, rng) {
  let s = '';
  for (let j = 0; j < len; j++) s += CHARS[Math.floor(rng() * 26)];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generateData(n, seed = 42) {
  let r = seed;
  const nf = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  const total = n + Math.floor(n * dupRate);
  const recs = new Array(total);
  for (let i = 0; i < n; i++) {
    recs[i] = { first: genName(4 + Math.floor(nf() * 5), nf), last: genName(5 + Math.floor(nf() * 6), nf) };
  }
  for (let i = 0; i < Math.floor(n * dupRate); i++) {
    const orig = recs[i % n];
    recs[n + i] = { first: orig.first, last: orig.last + (nf() < 0.5 ? 'son' : '') };
  }
  for (let i = total - 1; i > 0; i--) { const j = Math.floor(nf() * (i + 1)); [recs[i], recs[j]] = [recs[j], recs[i]]; }
  return recs;
}

async function runER(records) {
  const { runPipeline } = await import('/workspace/entity-resolver/packages/entity-resolver-core/dist/index.js');
  const { NodeDuckDBBackend } = await import('/workspace/entity-resolver/packages/entity-resolver-node/dist/duckdb-backend.js');

  const config = {
    comparisons: [
      { field: 'first', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
      { field: 'last', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
    ],
    blocking: { passes: [{ fields: ['first'], transforms: ['lowercase'] }, { fields: ['last'], transforms: ['lowercase'] }] },
  };

  const be = new NodeDuckDBBackend('/tmp/er_bench.db');
  const t0 = performance.now();
  const result = await runPipeline(records, config, { sqlBackend: be });
  const ms = performance.now() - t0;
  await be.close();

  return {
    engine: 'entity-resolver-sql',
    version: '0.1.0',
    records: records.length,
    timeMs: Math.round(ms),
    timeSec: (ms / 1000).toFixed(1),
    pairs: result.scoredPairs?.length ?? 0,
    throughput: Math.round(records.length / (ms / 1000)),
    mode: 'DuckDB pushdown, inline prefix filter, 2-field jaro_winkler',
  };
}

function runSplink(records) {
  try {
    const pyScript = resolve(import.meta.dirname || '.', 'splink_bench.py');
    const out = execSync(`python3 ${pyScript}`, {
      input: JSON.stringify(records),
      timeout: 120000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(out.trim());
  } catch (e) {
    return { engine: 'splink', error: e.message, records: records.length };
  }
}

async function main() {
  console.log(`=== Benchmark: ${scale} (${N} records) ===`);
  const records = generateData(N);
  console.log(`Generated ${records.length} records`);
  const results = [];

  console.log('Running entity-resolver...');
  const er = await runER(records);
  results.push(er);
  console.log(`  ${er.timeSec}s, ${er.pairs} pairs, ${er.throughput} rec/s`);

  console.log('Running Splink...');
  const sp = runSplink(records);
  results.push(sp);
  console.log(`  ${sp.timeSec || 'ERR'}s, ${sp.pairs || 'N/A'} pairs`);

  writeFileSync(resolve(OUT, 'results.json'), JSON.stringify({ scale, timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nSaved ${OUT}/results.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
