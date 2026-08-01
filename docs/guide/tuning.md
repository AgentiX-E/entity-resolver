# Configuration Tuning Guide

This guide covers how to tune entity resolution parameters for optimal precision, recall, and performance.

## 1. Threshold Selection

The `matchThreshold` controls the decision boundary between "match" and "non-match". It is applied as the minimum match probability required for a pair to be considered a match.

### Precision-Recall Relationship

```
Precision ──→ Higher threshold = fewer false positives (high precision)
Recall    ──→ Lower threshold = fewer false negatives (high recall)

        Precision ↑
                  │  ● (threshold=0.9)
                  │     ● (0.8)
                  │        ● (0.7)
                  │           ● (0.6)
                  │              ● (0.5) ← default
                  │                 ● (0.4)
                  │                    ● (0.2)
                  └──────────────────────→ Recall
```

The default threshold of **0.5** balances precision and recall for most use cases. At 0.5, the F1 score (harmonic mean of precision and recall) is typically maximized.

### Recommended Thresholds by Use Case

| Use Case | Threshold | Rationale |
|----------|:---------:|-----------|
| **Marketing dedup** (tolerate false positives) | 0.3 – 0.5 | Missing a merge (false negative) wastes marketing spend |
| **CRM cleanup** (balanced) | 0.5 – 0.7 | Balance between missing duplicates and falsely merging |
| **Financial compliance** (zero false positives) | 0.8 – 0.95 | False merge incurs regulatory risk |
| **Healthcare records** (HIPAA) | 0.9 – 0.99 | Patient safety demands near-certainty |
| **E-commerce product matching** | 0.6 – 0.8 | Slight preference for precision over recall |
| **Academic citation linkage** | 0.4 – 0.6 | False negatives are more costly than false positives |

### How matchThreshold Relates to F1

```typescript
import { runPipeline, evaluateClustering } from '@agentix-e/entity-resolver-core';

// Sweep thresholds to find the optimal F1
const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
for (const t of thresholds) {
  const result = await runPipeline(records, { ...config, matchThreshold: t });
  const metrics = evaluateClustering(result.clusters, groundTruth);
  console.log(`Threshold=${t}: P=${metrics.pairwisePrecision.toFixed(2)} R=${metrics.pairwiseRecall.toFixed(2)} F1=${metrics.pairwiseF1.toFixed(2)}`);
}
```

## 2. Blocking Strategy Selection

Blocking reduces the O(N²) comparison space to near O(N). The right strategy depends on your data characteristics.

### Strategy Comparison

| Strategy | Speed | Recall | Best For |
|----------|:-----:|:------:|----------|
| **Standard** | Very Fast | Lower | Structured data with clean, reliable blocking keys |
| **Token** | Fast | Higher | Free-text fields, multi-word values |
| **Sorted Neighborhood** | Fast | Medium | Typo-tolerant matching on sorted fields |
| **Multi-pass** | Medium | Highest | When you can't afford to miss any matches |
| **Meta-blocking** | Medium | High | Noisy blocking keys, large block sizes |
| **Suffix Arrays** | Medium | Very High | Short string fields with suffix patterns |
| **Extended Q-Grams** | Medium | High | Pattern-based blocking on substrings |
| **TF-IDF** | Slow | Highest | Text-heavy fields like product descriptions |

### When to Use Each Strategy

```typescript
import {
  standardBlocking,
  tokenBlocking,
  sortedNeighborhood,
  multiPassBlocking,
  metaBlocking,
} from '@agentix-e/entity-resolver-core';

// Standard: exact match on clean fields like zipcode, state, or ID prefix
const pairs1 = standardBlocking(records, {
  passes: [{ fields: ['zipcode', 'state'], transforms: ['lowercase'] }],
});

// Token: shared tokens in name or address fields
const pairs2 = tokenBlocking(records, {
  fields: ['company_name'],
  minTokenLength: 3,
});

// Sorted Neighborhood: sliding window over sorted names
const pairs3 = sortedNeighborhood(records, {
  sortKey: 'full_name',
  windowSize: 5,
});

// Multi-pass: union of multiple blocking strategies for high recall
const pairs4 = multiPassBlocking(records, [
  { type: 'standard', fields: ['email'] },
  { type: 'standard', fields: ['phone'] },
  { type: 'token', fields: ['name'] },
]);

// Meta-blocking: weight edges and prune weak blocks
const pairs5 = metaBlocking(pairs4, {
  weighting: 'ECBS',       // Edge-Centric Blocking Score
  pruning: 'WNP',           // Weighted Node Pruning
  topK: 100,
});
```

### Choice by Data Characteristics

| Data Profile | Recommended Strategy |
|--------------|---------------------|
| Clean, structured (e.g., CRM export) | Standard on email or ID |
| Dirty, free-text (e.g., web scraped) | Token + Multi-pass |
| Typo-heavy names | Sorted Neighborhood on name |
| Large datasets (100K+) | Standard with multiple passes |
| Unknown data quality | Multi-pass with meta-blocking |

### Blocking Analysis

Use the built-in blocking analyzer to verify your strategy captures enough true matches:

```typescript
import { analyzeBlockingRule, verifyBlockingRecall } from '@agentix-e/entity-resolver-core';

// Check reduction ratio (lower is better — fewer pairs to compare)
const analysis = analyzeBlockingRule(records, {
  passes: [{ fields: ['zipcode'] }],
});
console.log(`Reduction ratio: ${analysis.reductionRatio}`);

// Verify against ground truth
const recall = verifyBlockingRecall(records, groundTruthPairs, {
  passes: [{ fields: ['last_name', 'first_name'] }],
});
console.log(`Blocking recall: ${(recall * 100).toFixed(1)}%`);
```

## 3. Scorer Selection

Choose the right scorer for each field type. The scorer determines how similarity is measured between two field values.

### Scorer by Field Type

| Field Type | Recommended Scorer | Why |
|------------|-------------------|-----|
| Email | `exact` | Emails should match exactly (normalized) |
| Full Name | `jaro_winkler` | Handles typos, prefixes, transpositions |
| Company Name | `token_sort` | Word-order independent comparison |
| Address | `levenshtein` | Edit-distance tolerant for abbreviations |
| Phone Number | `exact` (after normalizePhone) | Digits only comparison |
| Date of Birth | `date_diff` | Handles format variations, computes day difference |
| Price / Amount | `numeric_diff` | Normalized numeric difference percentage |
| Product Title | `tfidf_cosine` or `qgram_tfidf` | TF-IDF for term-level comparison |
| Free Text Description | `dice` or `jaccard` | Token overlap metrics |
| Boolean Flags | `boolean_match` | Simple equality |
| Geospatial (lat/lng) | `radial` | Great-circle distance |
| CJK Text | `levenshtein` or `jaro` | Character-level (not word-level) |

### Configuration Examples

```typescript
const config = {
  comparisons: [
    { field: 'email', scorerName: 'exact', weight: 0.3 },
    { field: 'full_name', scorerName: 'jaro_winkler', weight: 0.25 },
    { field: 'company', scorerName: 'token_sort', weight: 0.15 },
    { field: 'address', scorerName: 'levenshtein', weight: 0.15 },
    { field: 'price', scorerName: 'numeric_diff', weight: 0.1 },
    { field: 'signup_date', scorerName: 'date_diff', weight: 0.05 },
  ],
};
```

### Ensemble Scorer

When one scorer isn't enough, combine multiple scorers with weights:

```typescript
import { ensembleScorer } from '@agentix-e/entity-resolver-core';

const scorer = ensembleScorer({
  scorers: [
    { name: 'levenshtein', weight: 0.5 },
    { name: 'soundex', weight: 0.3 },
    { name: 'jaro_winkler', weight: 0.2 },
  ],
  aggregation: 'weighted_average',
});
```

## 4. Match Weight Interpretation

### The log2(m/u) Formula

The Fellegi-Sunter model computes a match weight for each comparison:

```
weight = log₂(m / u)

where:
  m = P(observation | records match)     — data quality indicator
  u = P(observation | records do NOT match) — coincidence indicator
```

The total match weight is the **sum** of all individual field weights (assuming independence):

```
totalWeight = Σ log₂(mᵢ / uᵢ)
```

The match probability is derived from the total weight:

```
P(match) = 2^totalWeight / (1 + 2^totalWeight)
```

### How to Read Match Weights

| Total Weight | P(match) | Interpretation |
|:------------:|:--------:|----------------|
| > 20 | > 99.9999% | Near-certain match |
| 10 – 20 | 99.9% – 99.9999% | Very strong evidence |
| 5 – 10 | 97% – 99.9% | Strong evidence |
| 2 – 5 | 80% – 97% | Moderate evidence |
| 0 – 2 | 50% – 80% | Weak evidence |
| -2 – 0 | 20% – 50% | Evidence against match |
| < -2 | < 20% | Strong evidence against |

### Example: e-commerce product matching

```typescript
import { computeMatchWeight, weightToProbability } from '@agentix-e/entity-resolver-core';

// Product A:  "iPhone 14 Pro 256GB Black" ($999)
// Product B:  "Apple iPhone 14 Pro 256GB" ($989)

// Per-field weights (these come from EM estimation):
const weights = {
  title: 5.2,     // log₂(m/u) ≈ 5.2 → m ≈ 36× more likely for matches → strong signal
  brand: 3.1,     // "Apple" prefix match
  price: 1.8,     // $10 difference → moderate agreement
  color: -0.5,    // A has "Black", B missing → slight disagreement
};

const total = 5.2 + 3.1 + 1.8 + (-0.5); // = 9.6
const probability = weightToProbability(total);
console.log(`P(match) = ${(probability * 100).toFixed(1)}%`); // ≈ 99.87%
```

### Term Frequency Adjustment

Common values receive reduced weights to prevent false positives:

```typescript
import { buildTermFrequencies, adjustWeightByTF } from '@agentix-e/entity-resolver-core';

const frequencies = buildTermFrequencies(records, 'last_name');
// "Smith" appears 500 times → receives ~0.3 weight reduction
// "Xylophone" appears 1 time → receives full weight

const adjustedWeight = adjustWeightByTF(rawWeight, 'Smith', frequencies);
console.log(`Adjusted: ${adjustedWeight.toFixed(2)} (was: ${rawWeight.toFixed(2)})`);
```

## 5. EM Parameter Tuning

The Expectation-Maximization algorithm estimates m/u probabilities from comparison vectors.

### Parameters

```typescript
import { estimateParameters } from '@agentix-e/entity-resolver-core';

const result = estimateParameters(comparisonVectors, {
  maxIterations: 100,        // Default: 100. Max EM iterations before stopping.
  convergenceTolerance: 1e-5, // Default: 1e-5. Stop when parameter change < this.
  numRestarts: 3,             // Default: 1. Multiple random starts to avoid local optima.
  maxPairs: 100000,           // Default: 100K. Sample size cap for EM estimation.
});
```

### Parameter Guidelines

| Parameter | When to Increase | When to Decrease |
|-----------|-----------------|------------------|
| `maxIterations` | Parameters not converging (check `result.converged`) | Speed is more important than precision |
| `convergenceTolerance` | — | Parameters oscillating without convergence |
| `numRestarts` | Results inconsistent between runs | Performance is critical |
| `maxPairs` | Large datasets, good parameter estimates needed | Memory constrained |

### Interpreting EM Output

```typescript
console.log(`Converged: ${result.converged}`);
console.log(`Iterations: ${result.iterations}`);
console.log(`Log-likelihood: ${result.logLikelihood}`);

// m-probabilities — how well this field agrees for true matches
for (const [field, params] of Object.entries(result.parameters)) {
  console.log(`${field}: m=${params.m.toFixed(3)} u=${params.u.toFixed(3)}`);
  // High m (>0.8): reliable field, strong agreement for true matches
  // High u (>0.1): common values, weak signal for distinguishing matches
}
```

## 6. Performance — DuckDB SQL Pushdown vs In-Memory

### When to Use Each

| Mode | Best For | Limit |
|------|----------|-------|
| **In-Memory (JS)** | < 10,000 records | O(N²) at high duplication rates |
| **DuckDB SQL Pushdown** | >= 10,000 records | Requires DuckDB node backend |

### Performance Characteristics

```typescript
import { runPipeline } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

// In-memory: fast for small datasets, simple setup
const result1 = await runPipeline(records, config);

// SQL pushdown: linear scaling for large datasets
const backend = new NodeDuckDBBackend(':memory:');
const result2 = await runPipeline(records, config, { sqlBackend: backend });
await backend.close();

// Persistent DuckDB: survives restarts
const persistent = new NodeDuckDBBackend('/data/er_store.duckdb');
const result3 = await runPipeline(records, config, { sqlBackend: persistent });
```

### Prefix Filter (Inline Deduplication)

The SQL pipeline uses an inline prefix filter to prevent O(N²) pair explosion:

```typescript
const config = {
  blocking: {
    passes: [{ fields: ['name'], transforms: ['lowercase'] }],
  },
  // Prefix filter reduces pairs when blocking produces large blocks
  // Automatically enabled in SQL mode
};
```

For diverse datasets with low duplication rates, the prefix filter can reduce pair count by 80-99%.

### Benchmark Data (synthetic, 20% duplication)

| Records | In-Memory Time | SQL Pushdown Time | Throughput |
|--------:|:--------------:|:-----------------:|:----------:|
| 10,000 | 0.05s | 0.08s | ~200K rec/s |
| 100,000 | 1.2s | 0.4s | ~250K rec/s |
| 500,000 | — | 1.5s | ~333K rec/s |
| 1,000,000 | — | 3.0s | ~333K rec/s |

## 7. Memory Sizing

### How Much RAM for How Many Records

Memory usage depends on dataset size, duplication rate, and pipeline mode.

#### In-Memory Mode

| Records | Duplication Rate | Approx RAM |
|--------:|:----------------:|:----------:|
| 1,000 | 5% | ~50 MB |
| 10,000 | 5% | ~200 MB |
| 10,000 | 50% | ~800 MB |
| 50,000 | 20% | ~2 GB |
| 100,000 | 20% | ~4 GB |

Formula: `RAM ≈ (records × fieldCount × avgFieldSize) + (pairs × 16 bytes)`

#### DuckDB SQL Pushdown

| Records | Approx RAM |
|--------:|:----------:|
| 100,000 | ~100 MB |
| 1,000,000 | ~300 MB |
| 10,000,000 | ~800 MB |

SQL pushdown is significantly more memory-efficient because:
- Pair generation happens in C++ engine
- Streaming comparison avoids materializing all pairs
- Aggregation is performed in DuckDB

### Memory Monitoring

```typescript
import { checkMemory, isMemoryHigh } from '@agentix-e/entity-resolver-core';

// Check if memory is above threshold
if (isMemoryHigh(0.85)) {
  console.warn('Memory usage above 85% — consider switching to SQL mode');
}

// Get detailed snapshot
const snapshot = checkMemory({
  maxHeapRatio: 0.9,
  maxRSS: 2 * 1024 * 1024 * 1024, // 2GB
});
console.log(snapshot);

// Estimate memory for blocking
import { estimateBlockingMemory } from '@agentix-e/entity-resolver-core';
const est = estimateBlockingMemory(records, { passes: [{ fields: ['name'] }] });
console.log(`Estimated blocking memory: ${(est / 1024 / 1024).toFixed(1)} MB`);
```

### Docker / K8s Limits

```yaml
# Recommended resource limits for different scales
# Small (up to 100K records)
resources:
  requests:
    memory: '256Mi'
  limits:
    memory: '512Mi'

# Medium (100K — 1M records, using DuckDB SQL)
resources:
  requests:
    memory: '512Mi'
  limits:
    memory: '1Gi'

# Large (1M+ records, with PostgreSQL backend)
resources:
  requests:
    memory: '1Gi'
  limits:
    memory: '2Gi'
```
