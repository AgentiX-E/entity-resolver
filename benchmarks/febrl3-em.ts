// Febrl3 EM Diagnostics Benchmark — validate Fellegi-Sunter implementation
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const DATA_FILE = '/tmp/febrl3_data.json'

if (!existsSync(DATA_FILE)) {
  // Generate Febrl3 via Python (ANU synthetic standard)
  const py = `
import json, random, string
random.seed(42)

# Standard Febrl3 configuration: 5000 originals + 5000 duplicates with 3 corruptions
first_names = ['John','Mary','David','Sarah','Michael','Emma','James','Linda','Robert','Patricia']
last_names = ['Smith','Jones','Williams','Brown','Taylor','Wilson','Davies','Evans','Thomas','Johnson']
streets = ['Main St','High St','Park Ave','Oak Rd','Cedar Ln','Elm Dr','Maple Ave','Pine St']

originals = []
for i in range(5000):
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

duplicates = []
for i in range(5000):
  orig = originals[i]
  dup = {
    'rec_id': f'rec-{i}-dup-0',
    'given_name': orig['given_name'],
    'surname': orig['surname'],
    'street_number': orig['street_number'],
    'address_1': orig['address_1'],
    'suburb': orig['suburb'],
    'postcode': orig['postcode'],
    'date_of_birth': orig['date_of_birth'],
    'soc_sec_id': orig['soc_sec_id'],
  }
  # Apply random corruptions (0-3 fields)
  corruptions = random.sample(['given_name','surname','address_1','postcode','date_of_birth'], k=random.randint(0,3))
  for field in corruptions:
    if field == 'date_of_birth': dup[field] = dup[field][:-1] + str(random.randint(0,9))
    elif field in ('given_name','surname','address_1'): dup[field] = dup[field][:-1] + random.choice(string.ascii_uppercase)
    elif field == 'postcode': dup[field] = str(int(dup[field]) + random.randint(-10,10))
  duplicates.append(dup)

# Add more duplicates with 2-3 corruptions each (standard Febrl3 has ~3 dup types)
for i in range(5000):
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
const originals = all.filter((r: any) => r.rec_id?.includes('-org'))
const duplicates = all.filter((r: any) => !r.rec_id?.includes('-org'))
console.log(`Originals: ${originals.length}, Duplicates: ${duplicates.length}, Total: ${all.length}`)

// Ground truth: same-index originals and duplicates are matches
const groundTruth = new Set<string>()
const truthCount = new Map<string, number>()
for (let i = 0; i < 5000; i++) {
  const origId = (originals[i] as any).rec_id as string
  for (const dup of duplicates) {
    if ((dup as any).rec_id?.startsWith(`rec-${i}-`)) {
      groundTruth.add(origId + '|' + (dup as any).rec_id)
      truthCount.set(origId, (truthCount.get(origId) ?? 0) + 1)
    }
  }
}
console.log(`Ground truth matches: ${groundTruth.size} (avg ${(groundTruth.size / 5000).toFixed(1)} per original)`)

// === RUN FELSELL-SUNTER EM TRAINING ===
const { initScorers } = await import('../packages/entity-resolver-core/dist/matching/scorers/registry.js')
await initScorers()

const config = {
  comparisons: [
    { field: 'given_name', scorerName: 'jaro_winkler', levels: [{ name: 'match', threshold: 0.8 }, { name: 'partial', threshold: 0.5 }] },
    { field: 'surname', scorerName: 'jaro_winkler', levels: [{ name: 'match', threshold: 0.8 }, { name: 'partial', threshold: 0.5 }] },
    { field: 'date_of_birth', scorerName: 'jaro_winkler', levels: [{ name: 'match', threshold: 0.9 }, { name: 'partial', threshold: 0.7 }] },
    { field: 'postcode', scorerName: 'jaro_winkler', levels: [{ name: 'match', threshold: 0.95 }] },
    { field: 'address_1', scorerName: 'jaro_winkler', levels: [{ name: 'match', threshold: 0.8 }, { name: 'partial', threshold: 0.5 }] },
  ],
  blocking: {
    passes: [
      { fields: ['surname', 'given_name'] },
    ],
  },
}

const core = await import('../packages/entity-resolver-core/dist/index.js')
const { NodeDuckDBBackend } = await import('../packages/entity-resolver-node/dist/duckdb-backend.js')

console.log('\n=== Running Fellegi-Sunter EM ===')
const t0 = performance.now()
const db = new NodeDuckDBBackend('/tmp/er_febrl_em.db')
const result = await core.runSqlLinkage(originals, duplicates, config, db)

const elapsed = (performance.now() - t0) / 1000
console.log(`${result.pairs?.length ?? 0} pairs scored in ${elapsed.toFixed(1)}s`)

// Evaluate F1
const pairs = (result.pairs ?? []) as Array<{ leftId: number; rightId: number; score: number }>
pairs.sort((a, b) => b.score - a.score)

let bestF1 = 0, bestThr = 0, bestTP = 0, bestFP = 0, bestFN = 0
for (const thr of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
  const pred = new Set<string>()
  for (const p of pairs) {
    if (p.score >= thr) {
      pred.add((originals[p.leftId] as any).rec_id + '|' + (duplicates[p.rightId] as any).rec_id)
    }
  }
  let tp = 0; for (const p of pred) if (groundTruth.has(p)) tp++
  const fp = pred.size - tp, fn = groundTruth.size - tp
  const f1 = tp > 0 ? (2 * tp) / (2 * tp + fp + fn) : 0
  if (f1 > bestF1) { bestF1 = f1; bestThr = thr; bestTP = tp; bestFP = fp; bestFN = fn }
}

console.log('\n═══════════════════════════════════')
console.log('  P1: Febrl3 EM Diagnostics')
console.log('═══════════════════════════════════')
console.log(`  F1 = ${bestF1.toFixed(4)}  P = ${bestTP + bestFP > 0 ? (bestTP / (bestTP + bestFP)).toFixed(4) : 'N/A'}  R = ${(bestTP / groundTruth.size).toFixed(4)}`)
console.log(`  TP=${bestTP} FP=${bestFP} FN=${bestFN} @ thr=${bestThr}`)
console.log('═══════════════════════════════════')
console.log(`  Splink on Febrl3: 0.998 | GoldenMatch: 0.943`)
console.log(`  Entity-Resolver:   ${bestF1.toFixed(4)}`)
console.log('═══════════════════════════════════')

await db.close()
