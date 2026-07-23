# Getting Started

Get your first entity resolution pipeline running in under 5 minutes.

## Installation

```bash
# Core computation engine (always required)
npm install @agentix-e/entity-resolver-core

# For Node.js (file I/O, DuckDB, PostgreSQL)
npm install @agentix-e/entity-resolver-node

# For browser (DuckDB WASM)
npm install @agentix-e/entity-resolver-browser
```

## 5-Minute Quick Start

### Node.js: Deduplicate a CSV File

```typescript
import { runPipeline } from '@agentix-e/entity-resolver-core';
import { resolveStorage } from '@agentix-e/entity-resolver-node';
import { readFileSync } from 'node:fs';

// 1. Read your data
const raw = readFileSync('./customers.csv', 'utf-8');
const lines = raw.trim().split('\n');
const headers = lines[0]!.split(',');
const records = lines.slice(1).map((line) => {
  const values = line.split(',');
  const rec: Record<string, string> = {};
  headers.forEach((h, i) => { rec[h.trim()] = values[i]!.trim(); });
  return rec;
});

// 2. Auto-configure comparisons and blocking
const comparisons = headers.map((h) => ({
  field: h.trim(),
  scorer: 'jaro_winkler' as const,
  weight: 1.0 / headers.length,
}));

// 3. Run the pipeline
const result = await runPipeline(records, {
  blocking: {
    passes: [{
      fields: headers.map(h => h.trim()).slice(0, 2),
      transforms: ['strip', 'lowercase'],
    }],
  },
  comparisons,
  matchThreshold: 0.7,
  autoConfigure: true,
});

// 4. View results
console.log(`Found ${result.statistics.matchedRecords} matched records`);
console.log(`${result.clusters.size} clusters identified`);

for (const [cid, cluster] of result.clusters) {
  if (cluster.memberIds.length > 1) {
    console.log(`\nCluster ${cid}:`);
    for (const id of cluster.memberIds) {
      console.log(`  - ${JSON.stringify(records[id as number])}`);
    }
  }
}
```

### Browser: Deduplicate In-Memory Data

```typescript
import { runPipeline } from '@agentix-e/entity-resolver-core';

const records = [
  { name: 'John Smith',  dob: '1990-01-15', city: 'New York' },
  { name: 'Jon Smyth',   dob: '1990-01-15', city: 'NYC' },
  { name: 'Jane Doe',    dob: '1985-06-20', city: 'Los Angeles' },
];

const result = await runPipeline(records, {
  blocking: {
    passes: [{ fields: ['name', 'dob'], transforms: ['strip', 'lowercase'] }],
  },
  comparisons: [
    { field: 'name', scorer: 'jaro_winkler', weight: 0.5 },
    { field: 'dob',  scorer: 'exact',        weight: 0.5 },
  ],
  matchThreshold: 0.7,
  autoConfigure: true,
});

// result.clusters contains grouped record IDs
// result.scoredPairs contains pairwise probabilities
// result.diagnostics contains waterfall and charts data
```

## Next Steps

- [Core Concepts](/guide/core-concepts) — Deep-dive into FS model, blocking, and scoring
- [Storage Backends](/guide/storage-backends) — Choose the right storage for your deployment
- [API Reference](/api/core/) — Full type-safe API documentation
- [Production Deployment](/guide/production) — Docker, mTLS, auth, monitoring
