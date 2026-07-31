import { runPipeline } from '/workspace/entity-resolver/packages/entity-resolver-core/dist/index.js';
import { NodeDuckDBBackend } from '/workspace/entity-resolver/packages/entity-resolver-node/dist/duckdb-backend.js';

const CHARS = 'abcdefghijklmnopqrstuvwxyz';

function genWithGT(n, s = 42) {
  let r = s;
  const nf = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  const total = n + Math.floor(n * 0.2);
  const recs = new Array(total);
  const truePairs = new Set(); // stores JSON-serialized pairs by record INDEX

  for (let i = 0; i < n; i++) {
    let f = ''; for (let j = 0; j < 4 + Math.floor(nf() * 5); j++) f += CHARS[Math.floor(nf() * 26)];
    let l = ''; for (let j = 0; j < 5 + Math.floor(nf() * 6); j++) l += CHARS[Math.floor(nf() * 26)];
    recs[i] = { first: f.charAt(0).toUpperCase() + f.slice(1), last: l.charAt(0).toUpperCase() + l.slice(1) };
  }
  // Build original-clone pairs BEFORE shuffle, using array indices
  for (let i = 0; i < Math.floor(n * 0.2); i++) {
    const orig = recs[i % n];
    recs[n + i] = { first: nf() < 0.5 ? orig.first.slice(0, 3) + 'x' : orig.first, last: orig.last + (nf() < 0.5 ? 'son' : '') };
    // Ground truth: record (i % n) matches record (n + i)
    truePairs.add((i % n) + '-' + (n + i));
  }
  // DON'T SHUFFLE — keep array index consistent with __row_id in DuckDB
  return { records: recs, truePairs };
}

function computeF1(scoredPairs, truePairs) {
  let tp = 0, fp = 0;
  for (const p of scoredPairs) {
    const key = p.leftId + '-' + p.rightId;
    const revKey = p.rightId + '-' + p.leftId;
    if (truePairs.has(key) || truePairs.has(revKey)) tp++;
    else fp++;
  }
  const fn = truePairs.size - tp;
  const prec = tp / Math.max(1, tp + fp);
  const rec = tp / Math.max(1, tp + fn);
  const f1 = 2 * prec * rec / Math.max(0.001, prec + rec);
  return {
    precision: (prec * 100).toFixed(1),
    recall: (rec * 100).toFixed(1),
    f1: (f1 * 100).toFixed(1),
    tp, fp, fn,
  };
}

const config = {
  comparisons: [
    { field: 'first', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
    { field: 'last', scorerName: 'jaro_winkler', levels: [{ name: 'match' }] },
  ],
  blocking: { passes: [{ fields: ['first'], transforms: ['lowercase'] }, { fields: ['last'], transforms: ['lowercase'] }] },
};

console.log('| Scale | Records | Time | Pairs | Precision | Recall | F1 | TP | FP | FN |');
console.log('|-------|--------|------|-------|-----------|--------|-----|----|----|----|');

for (const n of [1000, 10000, 100000, 500000]) {
  const { records, truePairs } = genWithGT(n, 42);
  const be = new NodeDuckDBBackend('/tmp/er_acc_' + n + '.db');
  const t0 = performance.now();
  const r = await runPipeline(records, config, { sqlBackend: be });
  const sec = ((performance.now() - t0) / 1000).toFixed(1);
  await be.close();

  const foundPairs = (r.scoredPairs || []).map(p => ({ leftId: p.leftId, rightId: p.rightId }));
  const { precision, recall, f1, tp, fp, fn } = computeF1(foundPairs, truePairs);

  console.log('| ' + (n/1000).toFixed(0) + 'K | ' + records.length + ' | ' + sec + 's | ' + (r.scoredPairs?.length ?? 0) + ' | ' + precision + '% | ' + recall + '% | ' + f1 + '% | ' + tp + ' | ' + fp + ' | ' + fn + ' |');
  try { require('fs').unlinkSync('/tmp/er_acc_' + n + '.db'); } catch {}
}
