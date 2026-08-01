# Scenario: Deduplicating a Customer Database

A common use case: cleaning a CRM with duplicate customer records.

## Data Preparation

```csv
first_name, last_name, email, city, signup_date
John, Smith, jsmith@gmail.com, New York, 2024-01-15
Jon, Smith, jsmith@gmail.com, NYC, 2024-01-15
Jane, Doe, janedoe@yahoo.com, LA, 2024-03-22
```

## Step 1: Configure the Pipeline

```typescript
import { runPipeline, autoConfigure } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

const records = loadCSV('customers.csv');
const config = autoConfigure(records);
// autoConfigure detects field types and suggests blocking+comparisons
```

## Step 2: Choose a Pipeline Mode

```typescript
// For < 10,000 records: in-memory JS pipeline (fastest)
const result = await runPipeline(records, config);

// For >= 10,000 records: DuckDB SQL pushdown (linear O(N) scaling, ~400K rec/s at 20% dup)
const backend = new NodeDuckDBBackend(':memory:');
const result = await runPipeline(records, config, { sqlBackend: backend });
await backend.close();
```

## Step 3: Interpret Results

```typescript
console.log(result.clusters.size, 'unique entities found');
// Clusters contain grouped record indices

for (const [clusterId, recordIndices] of result.clusters) {
  console.log(`Cluster ${clusterId}: records ${recordIndices}`);
  // Cluster 0: records [0, 1] → John Smith and Jon Smith are duplicates
}
```

## Step 4: Tune Precision

```typescript
// Custom comparator weights for your domain
const tunedConfig = {
  comparisons: [
    { field: 'email', scorerName: 'exact', levels: [{ name: 'exact_match' }] },
    { field: 'first_name', scorerName: 'jaro_winkler', levels: [{ name: 'similar' }] },
    { field: 'last_name', scorerName: 'jaro_winkler', levels: [{ name: 'similar' }] },
    { field: 'city', scorerName: 'levenshtein', levels: [{ name: 'near' }] },
  ],
  blocking: {
    passes: [
      { fields: ['email'], transforms: ['lowercase'] },
      { fields: ['last_name', 'first_name'], transforms: ['lowercase'] },
    ],
  },
};
```

## Expected Results

| Metric | autoConfigure | Tuned |
|--------|:--:|:--:|
| Pairs found | ~50 | ~30 |
| False positives | ~15 | ~3 |
| Recall | 85% | 95% |

The tuned config uses `email` as a strong exact-match blocker, reducing false positives from similar-but-different names.
