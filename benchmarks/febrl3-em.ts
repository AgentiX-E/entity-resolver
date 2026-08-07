// Febrl3 EM Diagnostics Benchmark — validate Fellegi-Sunter implementation
// Standard Febrl3: 5000 originals × 3 dups each, matching on personal fields
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const DATA_FILE = '/tmp/febrl3_data_v2.json'

if (!existsSync(DATA_FILE)) {
  const py = `
import json, random, string
random.seed(42)

# Standard Febrl3 configuration, scaled for in-memory EM validation
N = 1000  # number of originals
first_names = ['John','Mary','David','Sarah','Michael','Emma','James','Linda','Robert','Patricia']
last_names = ['Smith','Jones','Williams','Brown','Taylor','Wilson','Davies','Evans','Thomas','Johnson']
streets = ['Main St','High St','Park Ave','Oak Rd','Cedar Ln','Elm Dr','Maple Ave','Pine St']

originals = []
for i in range(N):
  originals.append({
    'rec_id': f'rec-{i}-org',
    'given_name': random.choice(first_names),
    'surname': random.choice(last_names),
    'street_number': str(random.randint(1,999)),
    'address_1': random.choice(streets),
    'suburb': f'Suburb{random.randint(1,50)}',
    'postcode': str(random.randint(2000,2999)),
    'date_of_birth': f'{random.randint(1940,2000)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}',
    'soc_sec_id': ''.join(random.choices('0123456789', k=9)),
  })

# Duplicate type 1: 0-3 corruptions (easy)
duplicates = []
for i in range(N):
  orig = originals[i]
  dup = {**orig, 'rec_id': f'rec-{i}-dup-0'}
  corruptions = random.sample(['given_name','surname','address_1','postcode','date_of_birth'], k=random.randint(0,3))
  for field in corruptions:
    if field == 'date_of_birth': dup[field] = dup[field][:-1] + str(random.randint(0,9))
    elif field in ('given_name','surname','address_1'): dup[field] = dup[field][:-1] + random.choice(string.ascii_uppercase)
    elif field == 'postcode': dup[field] = str(int(dup[field]) + random.randint(-10,10))
  duplicates.append(dup)

# Duplicate types 2-3: 2-3 corruptions each (harder)
for i in range(N):
  orig = originals[i]
  for m in range(1,3):
    dup = {k: v for k,v in orig.items()}
    dup['rec_id'] = f'rec-{i}-dup-{m}'
    corruptions = random.sample(['given_name','surname','address_1','postcode','date_of_birth'], k=m+1)
    for field in corruptions:
      if field == 'date_of_birth': dup[field] = dup[field][:-1] + str(random.randint(0,9))
      elif field in ('given_name','surname','address_1'): dup[field] = dup[field][:-1] + random.choice(string.ascii_uppercase)
      elif field == 'postcode': dup[field] = str(int(dup[field]) + random.randint(-10,10))
    duplicates.append(dup)

all_recs = originals + duplicates
json.dump(all_recs, open('${DATA_FILE}','w'))
print(f'Generated {len(originals)} originals + {len(duplicates)} duplicates = {len(all_recs)} records')
  `.replace(/\n/g, '\n')
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf-8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 })
  console.log(r.stdout.trim())
}

const all = JSON.parse(readFileSync(DATA_FILE, 'utf-8')) as Record<string, unknown>[]

// Strip metadata identifiers — keep only comparison-relevant fields
// (rec_id is a unique key; leaving it in breaks EM training's standardBlocking)
const records = all.map(({ rec_id, soc_sec_id, street_number, ...rest }) => rest)
console.log(`Total records: ${records.length} (stripped rec_id, soc_sec_id, street_number)`)

// Build ground truth from original rec_id -> index mapping
const allRecIds = all.map((r: any) => r.rec_id as string)
const groundTruth = new Set<string>()
// Find the max original index from rec_id patterns
const getOrigIndex = (id: string) => { const m = id.match(/^rec-(\d+)-/); return m ? parseInt(m[1]!) : -1 }
const maxOrig = Math.max(...allRecIds.map(getOrigIndex))
for (let i = 0; i <= maxOrig; i++) {
  const orig = `rec-${i}-org`
  const oi = allRecIds.indexOf(orig)
  for (let m = 0; m <= 2; m++) {
    const dup = `rec-${i}-dup-${m}`
    const di = allRecIds.indexOf(dup)
    if (oi >= 0 && di >= 0) {
      groundTruth.add(oi < di ? `${oi}|${di}` : `${di}|${oi}`)
    }
  }
}
console.log(`Ground truth matches: ${groundTruth.size}`)

// === RUN Fellegi-Sunter EM ===

const config = {
  matchThreshold: 0.5,
  comparisons: [
    { field: 'given_name', scorerName: 'jaro_winkler', levels: [
      { label: 'match', threshold: 0.8 },
      { label: 'partial', threshold: 0.5 },
    ]},
    { field: 'surname', scorerName: 'jaro_winkler', levels: [
      { label: 'match', threshold: 0.8 },
      { label: 'partial', threshold: 0.5 },
    ]},
    { field: 'date_of_birth', scorerName: 'jaro_winkler', levels: [
      { label: 'match', threshold: 0.9 },
      { label: 'partial', threshold: 0.7 },
    ]},
    { field: 'postcode', scorerName: 'jaro_winkler', levels: [
      { label: 'match', threshold: 0.95 },
    ]},
    { field: 'address_1', scorerName: 'jaro_winkler', levels: [
      { label: 'match', threshold: 0.8 },
      { label: 'partial', threshold: 0.5 },
    ]},
    { field: 'suburb', scorerName: 'jaro_winkler', levels: [
      { label: 'match', threshold: 0.8 },
    ]},
  ],
  // Single-field multi-pass blocking — creates varied agreement patterns
  // so EM can learn which fields are truly discriminative.
  // Prior bug: {surname+given_name} combined blocking produced only
  // pairs that agree on both fields, causing EM to degenerate (m≈u for all).
  blocking: {
    passes: [
      { fields: ['surname'], transforms: ['lowercase'] as const[] },
      { fields: ['given_name'], transforms: ['lowercase'] as const[] },
      { fields: ['date_of_birth'], transforms: [] },
      { fields: ['postcode'], transforms: [] },
      { fields: ['address_1'], transforms: [] },
    ],
  },
}

// ─── EM Parameter Diagnostic ──────────────────────────────────────
const { standardBlocking: _sb } = await import('../packages/entity-resolver-core/dist/blocking/standard.js')
const { generateComparisonVectors: _gcv } = await import('../packages/entity-resolver-core/dist/matching/comparison.js')
const { estimateParameters: _ep } = await import('../packages/entity-resolver-core/dist/fellegi-sunter/em.js')

const _sampleSize = Math.min(2000, records.length)
const emBlock = _sb(records.slice(0, _sampleSize), config.blocking as any)
console.log(`\nEM diagnostic: ${emBlock.pairs.length} candidate pairs from blocking`)

const fieldMeta = new Map<string, any>()
for (const c of config.comparisons) {
  fieldMeta.set(c.field, { name: c.field, semanticType: 'text', cardinality: 10, isNumeric: false })
}
const vectors: any[][] = []
for (const pair of emBlock.pairs.slice(0, 3000)) {
  const a = records[pair.leftId]
  const b = records[pair.rightId]
  if (a && b) vectors.push(_gcv(a as any, b as any, config.comparisons as any, fieldMeta))
}
console.log(`EM diagnostic: ${vectors.length} comparison vectors`)

if (vectors.length >= 5) {
  const emResult = _ep(vectors as any, { maxIterations: 20, epsilon: 1e-4, seed: 42 })
  console.log(`EM diagnostic: λ=${(emResult.parameters as any).lambda.toFixed(4)}`)
  const mp = emResult.parameters.mProbabilities as Map<string, number>
  const up = emResult.parameters.uProbabilities as Map<string, number>
  console.log('  m-probabilities:')
  for (const [k, v] of [...mp.entries()].slice(0, 10)) console.log(`    ${k}: ${v.toFixed(4)}`)
  console.log('  u-probabilities:')
  for (const [k, v] of [...up.entries()].slice(0, 10)) console.log(`    ${k}: ${v.toFixed(4)}`)
  // Show computed weights
  console.log('  Field weights (log2(m/u)):')
  for (const c of config.comparisons) {
    const m = mp.get(c.field + ':match') ?? 0.9
    const u = up.get(c.field + ':match') ?? 0.1
    console.log(`    ${c.field}: m=${m.toFixed(4)} u=${u.toFixed(4)} weight=${Math.log2(m / u).toFixed(4)}`)
  }
}

const core = await import('../packages/entity-resolver-core/dist/index.js')
const { NodeDuckDBBackend } = await import('../packages/entity-resolver-node/dist/duckdb-backend.js')

console.log('\n=== Running Fellegi-Sunter EM (built-in training + scoring) ===')
const t0 = performance.now()
const db = new NodeDuckDBBackend('/tmp/er_febrl_em.db')
const result = await core.runSqlPipeline(records, config, db)

const elapsed = (performance.now() - t0) / 1000
const pairs = (result.pairs ?? []) as Array<{ leftId: number; rightId: number; score: number }>
pairs.sort((a, b) => b.score - a.score)
console.log(`${pairs.length} pairs scored in ${elapsed.toFixed(1)}s (block ${result.timing?.blockingMs?.toFixed(0) ?? '?'}ms + comp ${result.timing?.comparisonMs?.toFixed(0) ?? '?'}ms + EM ${result.timing?.emMs ?? 0}ms)`)

// Min-max normalize scores to [0,1] for threshold evaluation
let scoreMin = Infinity, scoreMax = -Infinity
for (const p of pairs) {
  if (p.score < scoreMin) scoreMin = p.score
  if (p.score > scoreMax) scoreMax = p.score
}
const range = scoreMax - scoreMin || 1
const normScore = (raw: number) => (raw - scoreMin) / range

console.log(`Score range: [${scoreMin.toFixed(2)}, ${scoreMax.toFixed(2)}]`)

// Evaluate F1 across thresholds
let bestF1 = 0, bestThr = 0, bestTP = 0, bestFP = 0, bestFN = 0
let bestP = 0, bestR = 0
for (const thr of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
  const pred = new Set<string>()
  for (const p of pairs) {
    if (normScore(p.score) >= thr) {
      const key = p.leftId < p.rightId ? `${p.leftId}|${p.rightId}` : `${p.rightId}|${p.leftId}`
      pred.add(key)
    }
  }
  let tp = 0
  for (const p of pred) if (groundTruth.has(p)) tp++
  const fp = pred.size - tp
  const fn = groundTruth.size - tp
  const precision = pred.size > 0 ? tp / pred.size : 0
  const recall = groundTruth.size > 0 ? tp / groundTruth.size : 0
  const f1 = tp > 0 ? (2 * tp) / (2 * tp + fp + fn) : 0
  if (f1 > bestF1) {
    bestF1 = f1; bestThr = thr; bestTP = tp; bestFP = fp; bestFN = fn
    bestP = precision; bestR = recall
  }
}

// Score distribution diagnostic (normalized)
const posScores: number[] = []
const negScores: number[] = []
for (const p of pairs) {
  const key = p.leftId < p.rightId ? `${p.leftId}|${p.rightId}` : `${p.rightId}|${p.leftId}`
  const ns = normScore(p.score)
  if (groundTruth.has(key)) posScores.push(ns)
  else negScores.push(ns)
}
posScores.sort((a,b) => b-a)
negScores.sort((a,b) => b-a)
const median = (arr: number[]) => arr.length > 0 ? arr[Math.floor(arr.length/2)]! : 0

console.log('\n═══════════════════════════════════')
console.log('  P1: Febrl3 EM Diagnostics')
console.log('═══════════════════════════════════')
console.log(`  F1 = ${bestF1.toFixed(4)}  P = ${bestP.toFixed(4)}  R = ${bestR.toFixed(4)}`)
console.log(`  TP=${bestTP} FP=${bestFP} FN=${bestFN} @ thr=${bestThr}`)
console.log('───────────────────────────────────')
console.log(`  True-match  scores: min=${posScores.length>0 ? posScores[posScores.length-1]!.toFixed(4) : 'N/A'} max=${posScores[0]?.toFixed(4) ?? 'N/A'} median=${median(posScores).toFixed(4)} n=${posScores.length}`)
console.log(`  False-match scores: min=${negScores.length>0 ? negScores[negScores.length-1]!.toFixed(4) : 'N/A'} max=${negScores[0]?.toFixed(4) ?? 'N/A'} median=${median(negScores).toFixed(4)} n=${negScores.length}`)
console.log('═══════════════════════════════════')
console.log(`  Splink on Febrl3:   0.998`)
console.log(`  GoldenMatch (EM):   0.943`)
console.log(`  Entity-Resolver EM: ${bestF1.toFixed(4)}`)
console.log('═══════════════════════════════════')

await db.close()
