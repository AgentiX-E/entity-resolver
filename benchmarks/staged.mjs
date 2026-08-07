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
    { field: 'first', scorerName: 'jaro_winkler', levels: [{ label: 'match' }] },
    { field: 'last', scorerName: 'jaro_winkler', levels: [{ label: 'match' }] },
  ],
  blocking: { passes: [{ fields: ['first'], transforms: ['lowercase'] }, { fields: ['last'], transforms: ['lowercase'] }] },
};

async function main() {
  const corePath = resolve(import.meta.dirname || '.', '../packages/entity-resolver-core/dist/index.js');
  const nodePath = resolve(import.meta.dirname || '.', '../packages/entity-resolver-node/dist/duckdb-backend.js');
  const { runPipeline } = await import(corePath);
  const { NodeDuckDBBackend } = await import(nodePath);

  const scales = { '1K': 1000, '10K': 10000, '50K': 50000, '100K': 100000, '500K': 500000, '1M': 1000000 };
  const ITERATIONS = 3;
  const results = [];

  console.log('| Scale | Records | ER SQL | ER pairs | Rec/s (mean±σ) |');
  console.log('|-------|---------|--------|----------|-----------------|');

  // Warm-up: 1K run to populate DuckDB optimizer caches and JIT
  console.log('Warm-up...');
  const warmRecords = genSynthetic(1000, 42);
  const warmBe = new NodeDuckDBBackend('/tmp/er_warmup.db');
  await runPipeline(warmRecords, config, { sqlBackend: warmBe });
  await warmBe.close();
  try { execSync('rm -f /tmp/er_warmup.db'); } catch {}
  console.log('Warm-up complete.\n');

  for (const [label, n] of Object.entries(scales)) {
    process.stdout.write(label + '... ');
    const records = genSynthetic(n, 42);
    const runTimes = [];

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const dbPath = `/tmp/er_staged_${n}_${iter}.db`;
      const be = new NodeDuckDBBackend(dbPath);
      const t0 = performance.now();
      const r = await runPipeline(records, config, { sqlBackend: be });
      const ms = performance.now() - t0;
      runTimes.push(ms);
      await be.close();
      try { execSync(`rm -f ${dbPath}`); } catch {}

      // Only store results from first iteration for pair counts
      if (iter === 0) {
        var firstResult = r;
      }
    }

    const mean = runTimes.reduce((a, b) => a + b, 0) / runTimes.length;
    const variance = runTimes.reduce((s, t) => s + (t - mean) ** 2, 0) / runTimes.length;
    const stddev = Math.sqrt(variance);
    const sec = (mean / 1000).toFixed(1);
    const rps = Math.round(records.length / (mean / 1000));
    results.push({
      scale: label,
      engine: 'entity-resolver-sql',
      records: records.length,
      timeMs: Math.round(mean),
      timeSec: sec,
      timeStddevMs: Math.round(stddev),
      pairs: firstResult.scoredPairs?.length ?? 0,
      throughput: rps,
      iterations: ITERATIONS,
    });
    console.log('|', label, '|', records.length, '|', sec + 's', '|', firstResult.scoredPairs?.length ?? 0, '|', rps, '±', Math.round(stddev), 'ms |');
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
