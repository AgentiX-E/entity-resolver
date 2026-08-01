# Scenario: Cross-Source Record Linkage

This walkthrough covers matching records across two separate datasets — a common task when joining data from different providers who use different schemas and identifiers.

## 1. Introduction: Cross-Source Matching vs Deduplication

| Aspect | Deduplication | Cross-Source Linkage |
|--------|:------------:|:--------------------:|
| Input | Single dataset | Two datasets (left + right) |
| Matching | Within the same source | Only across sources |
| Example | Finding duplicates in a CRM | Matching DBLP papers to ACM citations |
| Key constraint | O(N²) within single dataset | O(|left| × |right|) cross-product |
| Output | Clusters of duplicates | Matched pairs across sources |

In linkage mode, records from the same source are never compared — only cross-source pairs are generated, making it more efficient than deduplication for two-source problems.

## 2. Loading Data: DBLP-ACM Example

The DBLP-ACM benchmark is the classic record linkage dataset. DBLP and ACM are two bibliographic databases with overlapping paper entries but different schemas:

```typescript
import { readFileSync } from 'node:fs';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';
import { runSqlLinkage, autoConfigure, evaluateClustering } from '@agentix-e/entity-resolver-core';

// Load DBLP (2616 papers in benchmark)
const dblpRaw = readFileSync('./benchmarks/datasets/DBLP-ACM/DBLP2.csv', 'utf-8');
const dblp = parseCSV(dblpRaw);

// Load ACM (2294 papers)
const acmRaw = readFileSync('./benchmarks/datasets/DBLP-ACM/ACM.csv', 'utf-8');
const acm = parseCSV(acmRaw);

console.log(`Loaded ${dblp.length} DBLP records + ${acm.length} ACM records`);
// → Loaded 2616 DBLP records + 2294 ACM records

// Load ground truth for evaluation (2224 true matches)
const truthRaw = readFileSync('./benchmarks/datasets/DBLP-ACM/DBLP-ACM_perfectMapping.csv', 'utf-8');
const groundTruth = parseGroundTruth(truthRaw);

// Helper: simple CSV parser
function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.trim().split('\n');
  const headers = lines[0]!.split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = values[i] ?? ''; });
    return rec;
  });
}
```

### Using pandas (Python bridge) for data loading

If your data is in pandas, export to parquet and use DuckDB's native reader:

```typescript
import { DuckDBInstance } from '@duckdb/node-api';

const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();
await conn.run("CREATE TABLE dblp AS SELECT * FROM read_parquet('dblp.parquet')");
await conn.run("CREATE TABLE acm AS SELECT * FROM read_parquet('acm.parquet')");
```

## 3. Configuring the Pipeline

The DBLP-ACM schema differs between sources. Configure comparisons that handle these differences:

```typescript
const config = {
  blocking: {
    passes: [
      // Block 1: match on year + first author initial
      { fields: ['year'], transforms: ['strip'] },
      // Block 2: match on title tokens (handles word reordering)
      { fields: ['title'], transforms: ['lowercase', 'strip'] },
    ],
  },
  comparisons: [
    {
      field: 'title',
      scorerName: 'jaro_winkler',
      levels: [
        { name: 'exact_match' },
        { name: 'similar' },
        { name: 'different' },
      ],
    },
    {
      field: 'authors',
      scorerName: 'token_sort',
      levels: [
        { name: 'exact_match' },
        { name: 'partial_match' },
        { name: 'different' },
      ],
    },
    {
      field: 'year',
      scorerName: 'exact',
      levels: [
        { name: 'match' },
        { name: 'near' },
        { name: 'different' },
      ],
    },
    {
      field: 'venue',
      scorerName: 'levenshtein',
      levels: [
        { name: 'exact_match' },
        { name: 'similar' },
        { name: 'different' },
      ],
    },
  ],
  matchThreshold: 0.5,
};
```

Key configuration decisions:
- **Title**: `jaro_winkler` handles minor spelling variations and word transpositions
- **Authors**: `token_sort` handles different author order formats (e.g., "J. Smith, M. Jones" vs "Jones, M.; Smith, J.")
- **Year**: `exact` with level-based comparison (same year, off-by-one, different)
- **Venue**: `levenshtein` handles abbreviated venue names ("VLDB" vs "Very Large Data Bases")

## 4. Running the Linkage with DuckDB

```typescript
import { runSqlLinkage } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

const backend = new NodeDuckDBBackend(':memory:');
const start = performance.now();

const result = await runSqlLinkage(dblp, acm, config, { backend });

console.log(`Linkage completed in ${(performance.now() - start).toFixed(0)}ms`);
console.log(`Total cross-source pairs: ${result.pairs.length}`);
console.log(`Statistics:`, result.statistics);

await backend.close();
```

### Expected Output (DBLP-ACM benchmark)

```
Linkage completed in 3500ms
Total cross-source pairs: 2224
Statistics: {
  totalPairsCompared: 52416,
  pairsAboveThreshold: 2224,
  executionTimeMs: 3450,
  reductionRatio: 0.991  // 99.1% of possible pairs eliminated by blocking
}
```

## 5. Interpreting Results

### Scored Pairs

Each pair is a cross-source match with a confidence score:

```typescript
// Top 5 matches by score
const topMatches = result.pairs
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

for (const pair of topMatches) {
  const dblpPaper = dblp[Number(pair.leftId)];
  const acmPaper = acm[Number(pair.rightId)];
  console.log(`Score: ${pair.score.toFixed(3)}`);
  console.log(`  DBLP: "${dblpPaper.title}" by ${dblpPaper.authors}`);
  console.log(`  ACM:  "${acmPaper.title}" by ${acmPaper.authors}`);
  console.log();
}
```

### Cluster Analysis

Linkage results contain `clusters` grouping records that match across sources:

```typescript
console.log(`Clusters: ${result.clusters.size}`);
let multiMatch = 0;
for (const [, cluster] of result.clusters) {
  if (cluster.memberIds.length > 2) {
    multiMatch++;
    console.log(`Multi-match cluster: ${cluster.memberIds.length} records`);
  }
}
console.log(`Clusters with >2 records: ${multiMatch}`);
```

### Diagnostics

```typescript
if (result.diagnostics) {
  // EM-estimated m/u parameters
  for (const [field, params] of Object.entries(result.diagnostics.muParameters)) {
    console.log(`${field}: m=${params.m.toFixed(2)} u=${params.u.toFixed(3)}`);
  }

  // Waterfall data — score distribution
  const histogram = result.diagnostics.waterfall;
  for (const bin of histogram) {
    console.log(`[${bin.rangeLow.toFixed(1)}-${bin.rangeHigh.toFixed(1)}]: ${bin.count} pairs`);
  }
}
```

## 6. Evaluation: Using evaluateClustering

Compare your linkage result against the ground truth:

```typescript
import { evaluateClustering } from '@agentix-e/entity-resolver-core';

// Build predicted clusters from linkage pairs
const predictedClusters = new Map<string, { memberIds: (string | number)[] }>();
for (const pair of result.pairs) {
  const key = `${pair.leftId}-${pair.rightId}`;
  predictedClusters.set(key, {
    memberIds: [String(pair.leftId), `acm_${pair.rightId}`],
  });
}

// Ground truth clusters
const groundClusters = new Map<string, { memberIds: (string | number)[] }>();
for (const [dblpId, acmId] of groundTruth.entries()) {
  groundClusters.set(`gt_${dblpId}`, {
    memberIds: [String(dblpId), `acm_${acmId}`],
  });
}

const metrics = evaluateClustering(predictedClusters, groundClusters);

console.log('╔══════════════════════════╗');
console.log('║   Linkage Evaluation     ║');
console.log('╠══════════════════════════╣');
console.log(`║ Precision:  ${(metrics.pairwisePrecision * 100).toFixed(1)}%        ║`);
console.log(`║ Recall:     ${(metrics.pairwiseRecall * 100).toFixed(1)}%        ║`);
console.log(`║ F1 Score:   ${(metrics.pairwiseF1 * 100).toFixed(1)}%        ║`);
console.log('╚══════════════════════════╝');
```

### Cross-Validation

For robust evaluation, use k-fold cross-validation:

```typescript
import { crossValidate } from '@agentix-e/entity-resolver-core';

const allRecords = [...dblp, ...acm];
const report = await crossValidate(allRecords, groundTruth, {
  folds: 5,
  config,
  sqlBackend: backend,
});

console.log(`Mean F1: ${(report.meanF1 * 100).toFixed(1)}%`);
console.log(`Std Dev: ${(report.stdF1 * 100).toFixed(1)}%`);
for (const [i, fold] of report.folds.entries()) {
  console.log(`Fold ${i + 1}: P=${(fold.precision * 100).toFixed(1)}% R=${(fold.recall * 100).toFixed(1)}%`);
}
```

## Complete Runable Example

```typescript
import { readFileSync } from 'node:fs';
import { runSqlLinkage, evaluateClustering, autoConfigure } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

async function main() {
  // 1. Load data
  const dblp = parseCSV(readFileSync('DBLP2.csv', 'utf-8'));
  const acm = parseCSV(readFileSync('ACM.csv', 'utf-8'));

  // 2. Auto-configure from data
  const autoResult = autoConfigure([...dblp.slice(0, 100), ...acm.slice(0, 100)]);
  console.log(`Auto-detected ${autoResult.fields.length} fields`);

  // 3. Run linkage
  const backend = new NodeDuckDBBackend(':memory:');
  const result = await runSqlLinkage(dblp, acm, autoResult.config, { backend });

  // 4. Report results
  console.log(`Found ${result.pairs.length} cross-source matches`);
  console.log(`Top match score: ${result.pairs[0]?.score ?? 0}`);

  await backend.close();
}

main().catch(console.error);
```
