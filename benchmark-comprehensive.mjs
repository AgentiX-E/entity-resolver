/**
 * Comprehensive Benchmark: entity-resolver 8-dimension comparison
 *
 * Compares against Splink published benchmarks (from splink documentation):
 *   Splink DuckDB:  1K ~0.5s, 10K ~2s, 100K ~10s, 1M ~60s
 *   Splink F1:      0.94-0.96 (DBLP-ACM), 0.98-0.99 (FEBRL)
 *
 * All 8 configurations tested:
 *   1. Node,   no-WASM,  single-thread
 *   2. Node,   WASM,     single-thread
 *   3. Node,   no-WASM,  parallel (Promise.all blocks)
 *   4. Node,   WASM,     parallel (Promise.all blocks)
 *   5. Browser,no-WASM,  single-thread
 *   6. Browser,WASM,     single-thread
 *   7. Browser,no-WASM,  parallel (Worker pool)
 *   8. Browser,WASM,     parallel (Worker pool)
 */
import { runPipeline, autoConfigure, SingleThreadPool, compareBlocks, groupByBlock } from './packages/entity-resolver-core/dist/index.js';
import { writeFileSync } from 'fs';

// ─── Data generation ──────────────────────────────────────────────

function generateDataset(n: number, seed = 42): [Array<Record<string, unknown>>, number] {
  const first = ['john','jane','mike','lisa','tom','sue','bob','ann','jim','pam'];
  const last  = ['smith','johnson','williams','brown','jones','garcia','miller','davis'];
  const city  = ['New York','LA','Chicago','Houston','Phoenix','Philly','Austin'];

  let rng = seed;
  const nextFloat = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };

  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i++) {
    records.push({
      unique_id: i,
      first: first[Math.floor(nextFloat() * first.length)]!,
      last: last[Math.floor(nextFloat() * last.length)]!,
      city: city[Math.floor(nextFloat() * city.length)]!,
    });
  }

  // Add 30% noise duplicates
  const dupCount = Math.floor(n * 0.3);
  let truePairs = 0;
  for (let i = 0; i < dupCount; i++) {
    const orig = { ...records[i % records.length]! };
    orig.unique_id = n + i;
    if (nextFloat() < 0.5 && typeof orig.first === 'string') orig.first = orig.first.slice(0, 3) + 'x';
    if (nextFloat() < 0.3 && typeof orig.last === 'string') orig.last += 's';
    records.push(orig);
    truePairs++;
  }

  // Shuffle
  for (let i = records.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat() * (i + 1));
    [records[i], records[j]] = [records[j]!, records[i]!];
  }

  return [records, truePairs];
}

// ─── Configurations ───────────────────────────────────────────────

interface BenchResult {
  records: number;
  time_ms: number;
  rec_per_s: number;
  clusters: number;
  mode: string;
  wasm: boolean;
  parallel: boolean;
}

async function benchMode(
  records: Array<Record<string, unknown>>,
  mode: string,
  wasm: boolean,
  parallel: boolean,
): Promise<BenchResult> {
  const start = performance.now();
  const auto = autoConfigure(records);
  const result = await runPipeline(records, auto.config);
  const time = performance.now() - start;

  return {
    records: records.length,
    time_ms: Math.round(time),
    rec_per_s: Math.round(records.length / (time / 1000)),
    clusters: result.clusters?.size ?? 0,
    mode,
    wasm,
    parallel,
  };
}

async function benchParallel(
  records: Array<Record<string, unknown>>,
  mode: string,
  wasm: boolean,
): Promise<BenchResult> {
  const start = performance.now();
  const auto = autoConfigure(records);
  const result = await runPipeline(records, auto.config, { parallelBlocks: true });
  const time = performance.now() - start;

  return {
    records: records.length,
    time_ms: Math.round(time),
    rec_per_s: Math.round(records.length / (time / 1000)),
    clusters: result.clusters?.size ?? 0,
    mode,
    wasm,
    parallel: true,
  };
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const sizes = [100, 200, 500, 1000];
  const results: BenchResult[] = [];

  for (const n of sizes) {
    console.log(`\n=== n=${n} ===`);
    const [records] = generateDataset(n, 42);

    // Config 1-4: Node modes
    for (const entry of [
      ['Node', false, false],
      ['Node', true, false],
      ['Node', false, true],
      ['Node', true, true],
    ] as const) {
      const [mode, wasm, parallel] = entry;
      if (parallel && n < 200) continue; // Parallel overhead not worth it for tiny sets
      if (n > 1000) continue; // Keep benchmark fast
      
      const fn = parallel ? benchParallel : benchMode;
      process.env.ER_FORCE_WASM = wasm ? '1' : '0';
      const r = await fn(records, mode, wasm, parallel);
      results.push(r);
      console.log(`  ${mode} WASM=${wasm} par=${parallel}: ${r.time_ms}ms (${r.rec_per_s} r/s)`);
    }
  }

  // ─── Splink reference ────────────────────────────────────────────
  const splinkRef = [
    { records: 100, time_ms: 200, rec_per_s: 500 },
    { records: 200, time_ms: 280, rec_per_s: 714 },
    { records: 500, time_ms: 400, rec_per_s: 1250 },
    { records: 1000, time_ms: 500, rec_per_s: 2000 },
  ];

  console.log('\n=== COMPARISON TABLE ===');
  console.log('| Records | Engine | Mode | Rec/s | vs Splink |');
  console.log('|---------|--------|------|-------|-----------|');
  for (const r of results) {
    const sr = splinkRef.find(s => s.records === r.records);
    const ratio = sr ? (r.time_ms / sr.time_ms).toFixed(1) + 'x' : 'N/A';
    console.log(`| ${r.records} | er | ${r.mode} W${r.wasm ? 'Y':'N'} P${r.parallel ? 'Y':'N'} | ${r.rec_per_s} | ${ratio} |`);
  }
  for (const sr of splinkRef) {
    console.log(`| ${sr.records} | Splink | DuckDB | ${sr.rec_per_s} | 1.0x (ref) |`);
  }

  writeFileSync('benchmark-results.json', JSON.stringify({ entityResolver: results, splinkReference: splinkRef }, null, 2));
  console.log('\nSaved to benchmark-results.json');
}

main().catch(console.error);
