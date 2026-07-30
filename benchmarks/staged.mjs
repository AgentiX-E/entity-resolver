/**
 * Staged Benchmark: entity-resolver at all scales — 1K → 1M
 *
 * Measures time, throughput, and pair counts at every scale.
 * Compares against Splink and recordlinkage (run via staged_bench.py).
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const OUT = resolve(import.meta.dirname || '.', 'output');
mkdirSync(OUT, { recursive: true });

const CHARS = 'abcdefghijklmnopqrstuvwxyz';
function genSynthetic(n, seed = 42) {
  let r = seed;
  const nf = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  const total = n + Math.floor(n * 0.2);
  const recs = new Array(total);
  for (let i = 0; i < n; i++) {
    let f = ''; for (let j = 0; j < 4 + Math.floor(nf() * 5); j++) f += CHARS[Math.floor(nf() * 26)];
    let l = ''; for (let j = 0; j < 5 + Math.floor(nf() * 6); j++) l += CHARS[Math.floor(nf() * 26)];
    recs[i] = { first: f.charAt(0).toUpperCase() + f.slice(1), last: l.charAt(0).toUpperCase() + l.slice(1) };
  }
  for (let i = 0; i < Math.floor(n * 0.2); i++) {
    const o = recs[i % n];
    recs[n + i] = { first: nf() < 0.5 ? o.first.slice(0, 3) + 'x' : o.first, last: o.last + (nf() < 0.5 ? 'son' : '') };
  }
  for (let i = total - 1; i > 0; i--) { const j = Math.floor(nf() * (i + 1)); [recs[i], recs[j]] = [recs[j], recs[i]]; }
  return recs;
}

const config = {
  comparisons: [
    { field: 'first', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
    { field: 'last', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
  ],
  blocking: { passes: [{ fields: ['first'], transforms: ['lowercase'] }, { fields: ['last'], transforms: ['lowercase'] }] },
};

async function main() {
  const { runPipeline } = await import('/workspace/entity-resolver/packages/entity-resolver-core/dist/index.js');
  const { NodeDuckDBBackend } = await import('/workspace/entity-resolver/packages/entity-resolver-node/dist/duckdb-backend.js');

  const scales = { '1K': 1000, '10K': 10000, '50K': 50000, '100K': 100000, '500K': 500000 };
  const results = [];

  console.log('| Scale | Records | ER SQL | ER pairs | Rec/s |');
  console.log('|-------|---------|--------|----------|-------|');

  for (const [label, n] of Object.entries(scales)) {
    process.stdout.write(label + '... ');
    const records = genSynthetic(n, 42);

    const be = new NodeDuckDBBackend('/tmp/er_staged_' + n + '.db');
    const t0 = performance.now();
    const r = await runPipeline(records, config, { sqlBackend: be });
    const ms = performance.now() - t0;
    await be.close();

    const sec = (ms / 1000).toFixed(1);
    const rps = Math.round(records.length / (ms / 1000));
    results.push({ scale: label, engine: 'entity-resolver-sql', records: records.length, timeMs: Math.round(ms), timeSec: sec, pairs: r.scoredPairs?.length ?? 0, throughput: rps });
    console.log('|', label, '|', records.length, '|', sec + 's', '|', r.scoredPairs?.length ?? 0, '|', rps, '|');

    try { execSync('rm -f /tmp/er_staged_' + n + '.db'); } catch {}
  }

  // Load competitor results
  const pyResults = existsSync(resolve(OUT, 'staged-results.json'))
    ? JSON.parse(readFileSync(resolve(OUT, 'staged-results.json'), 'utf-8'))
    : [];

  const allResults = [...results, ...pyResults];
  writeFileSync(resolve(OUT, 'staged-full.json'), JSON.stringify(allResults, null, 2));

  console.log('\n=== Cross-Engine Comparison ===');
  console.log('| Scale | entity-resolver | Splink | recordlinkage | Fastest |');
  console.log('|-------|:--:|:--:|:--:|:--:|');
  for (const [label] of Object.entries(scales)) {
    const er = results.find(r => r.scale === label);
    const sp = pyResults.find(r => r.scale === label && r.tool === 'splink');
    const rl = pyResults.find(r => r.scale === label && r.tool === 'recordlinkage');
    const times = [er?.timeSec, sp?.timeSec, rl?.timeSec].filter(Boolean).map(parseFloat);
    const fastest = times.length > 0 ? Math.min(...times) : 0;
    const fmt = (r) => r ? (parseFloat(r.timeSec) === fastest ? `**${r.timeSec}s**` : r.timeSec + 's') : 'N/A';
    console.log('|', label, '|', fmt(er), '|', fmt(sp), '|', fmt(rl), '|', fastest + 's', '|');
  }

  console.log('\nSaved staged-full.json');
}

main().catch(e => { console.error(e); process.exit(1); });
