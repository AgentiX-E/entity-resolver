/**
 * Magellan dataset benchmark — entity-resolver vs Splink
 *
 * Tests against the Magellan (UWM) benchmark datasets used by
 * Ditto and DeepMatcher for evaluating entity matching systems.
 *
 * Usage: node benchmarks/magellan.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse/sync';
import { execSync } from 'child_process';

const OUT = resolve(import.meta.dirname || '.', 'output');
mkdirSync(OUT, { recursive: true });

function loadCSV(path) {
  const raw = readFileSync(path, 'utf-8');
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
}

// ─── iTunes-Amazon ────────────────────────────────────────────────
const base = resolve(import.meta.dirname || '.', 'datasets');
const itunes = loadCSV(resolve(base, 'Magellan-iTunes.csv'));
const amazon = loadCSV(resolve(base, 'Magellan-Amazon.csv'));
const allRecords = [...itunes, ...amazon].map((r) => {
  // Normalize: ensure all values are strings
  const obj = {};
  for (const [k, v] of Object.entries(r)) obj[k] = String(v ?? '');
  return obj;
});

console.log(`=== Magellan iTunes-Amazon (${allRecords.length} records: ${itunes.length}+${amazon.length}) ===`);

// ─── entity-resolver benchmark ───────────────────────────────────
const corePath = resolve(import.meta.dirname || '.', '../packages/entity-resolver-core/dist/index.js');
const nodePath = resolve(import.meta.dirname || '.', '../packages/entity-resolver-node/dist/duckdb-backend.js');
const { runPipeline } = await import(corePath);
const { NodeDuckDBBackend } = await import(nodePath);

const config = {
  comparisons: [
    { field: 'Song_Name', scorerName: 'jaro_winkler', levels: [{ label: 'match' }] },
    { field: 'Artist_Name', scorerName: 'jaro_winkler', levels: [{ label: 'match' }] },
  ],
  blocking: {
    passes: [
      { fields: ['Song_Name'], transforms: ['lowercase'] },
      { fields: ['Artist_Name'], transforms: ['lowercase'] },
    ],
  },
};

const be = new NodeDuckDBBackend('/tmp/er_magellan_final.db');
const t0 = performance.now();
const r = await runPipeline(allRecords, config, { sqlBackend: be });
const sec = ((performance.now() - t0) / 1000).toFixed(1);
await be.close();

console.log(
  `entity-resolver: ${sec}s, ${r.scoredPairs?.length ?? 0} pairs, ${Math.round(allRecords.length / parseFloat(sec))} rec/s`,
);

// ─── Splink benchmark ────────────────────────────────────────────
try {
  const pyOut = execSync('python3 benchmarks/magellan_bench.py', {
    timeout: 300000, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024,
  }).trim();
  const match = pyOut.match(/Splink:\s+([\d.]+)s,\s+(\d+)\s+pairs/);
  if (match) {
    console.log(`Splink:          ${match[1]}s, ${match[2]} pairs`);
    writeFileSync(resolve(OUT, 'magellan-results.json'), JSON.stringify({
      dataset: 'Magellan-iTunes-Amazon',
      records: allRecords.length,
      er: { timeSec: sec, pairs: r.scoredPairs?.length ?? 0 },
      splink: { timeSec: match[1], pairs: parseInt(match[2]) },
      timestamp: new Date().toISOString(),
    }, null, 2));
  }
} catch (e) {
  console.log('Splink: ERR -', e.message?.slice(0, 80));
}

// Save results
writeFileSync(
  resolve(OUT, 'magellan-results.json'),
  JSON.stringify(
    {
      dataset: 'Magellan-iTunes-Amazon',
      records: allRecords.length,
      er: { timeSec: sec, pairs: r.scoredPairs?.length ?? 0 },
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log('\nSaved magellan-results.json');
