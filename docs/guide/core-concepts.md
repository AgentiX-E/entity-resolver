# Core Concepts

Understand the architecture and algorithms that power `@agentix-e/entity-resolver`.

## Architecture: Stateless Pure Computation

The core package (`entity-resolver-core`) is a **pure computation engine**. It defines all algorithm logic and DI interface contracts, but performs zero I/O and holds zero mutable state.

```
f(records) → { clusters, scoredPairs, diagnostics }
```

This enables the same core to run in Node.js, browsers, Edge Functions, Deno, Bun, and Cloudflare Workers — without modification.

## Entity Resolution Pipeline

The standard ER pipeline has 5 stages:

```
Raw Data
  │
  ▼
① Preprocessing ─── normalize, clean, standardize
  │
  ▼
② Blocking ──────── reduce O(n²) to near O(n)
  │
  ▼
③ Matching ──────── score candidate pairs
  │
  ▼
④ Clustering ────── group into entities
  │
  ▼
⑤ Output ────────── clusters, scores, diagnostics
```

### ① Preprocessing

Data cleaning and normalization before matching:

```typescript
import { preprocessRecords, normalizeEmail, normalizePhone, repairUnicode } from '@agentix-e/entity-resolver-core';

const cleaned = preprocessRecords(rawRecords, {
  lowercase: true,
  strip: true,
  repairUnicode: true,
});
```

### ② Blocking

Blocking reduces the O(n²) all-pairs comparison space by excluding pairs unlikely to match:

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Standard Blocking** | Exact match on blocking key | Structured data with reliable keys |
| **Token Blocking** | Block on shared tokens | Free-text fields |
| **Sorted Neighborhood** | Sliding window over sorted data | Typo-tolerant matching |
| **Multi-pass Blocking** | Union of multiple blocking passes | High recall requirements |
| **Meta-blocking** | Weight edges by block frequency | Noisy blocking keys |

```typescript
import { standardBlocking, tokenBlocking, sortedNeighborhood } from '@agentix-e/entity-resolver-core';

// Standard: exact match on blocking key
const pairs = standardBlocking(records, { fields: ['zipcode'] });

// Sorted neighborhood: sliding window
const snPairs = sortedNeighborhood(records, {
  sortKey: 'name',
  windowSize: 5,
});
```

### ③ Matching: Fellegi-Sunter Model

The core matching engine implements the **Fellegi-Sunter probabilistic model** with EM (Expectation-Maximization) parameter estimation:

| Parameter | Meaning | Interpretation |
|-----------|---------|---------------|
| **m-probability** | P(observation \| records match) | Measures data quality — high m means reliable matching field |
| **u-probability** | P(observation \| records do NOT match) | Measures coincidence — high u means common value, weak signal |
| **Match weight** | log₂(m/u) per field | Summed across independent fields |
| **Match probability** | 2^M / (1 + 2^M) | Posterior probability given total weight M |

```typescript
import { estimateParameters, computeMatchWeight, weightToProbability } from '@agentix-e/entity-resolver-core';

// EM estimation from comparison vectors
const emResult = estimateParameters(comparisonVectors, {
  maxIterations: 100,
  convergenceTolerance: 1e-5,
});

// Compute match weight from parameters
const weight = computeMatchWeight(comparisonVector, emResult.parameters);
const probability = weightToProbability(weight.aggregateWeight);
```

#### Match Weight Interpretation

| Weight Range | Interpretation |
|-------------|---------------|
| > 10 | Very strong evidence for match |
| 5 – 10 | Strong evidence |
| 0 – 5 | Weak evidence |
| < 0 | Evidence against match |

### ④ Scoring: 19 Built-in Scorers

| # | Scorer | Type | Algorithm |
|---|--------|------|-----------|
| 1 | `exact` | String | Exact match |
| 2 | `levenshtein` | String | Edit distance (normalized) |
| 3 | `damerau_levenshtein` | String | Edit distance with transpositions |
| 4 | `jaro` | String | Jaro similarity |
| 5 | `jaro_winkler` | String | Jaro-Winkler (prefix bonus) |
| 6 | `dice` | String | Dice coefficient |
| 7 | `jaccard` | String | Jaccard index |
| 8 | `overlap` | String | Overlap coefficient |
| 9 | `lcs` | String | Longest Common Subsequence ratio |
| 10 | `soundex` | String | Phonetic encoding |
| 11 | `double_metaphone` | String | Improved phonetic encoding |
| 12 | `token_sort` | String | Token sort ratio |
| 13 | `tfidf_cosine` | Text | TF-IDF cosine similarity |
| 14 | `qgram_tfidf` | Text | Q-gram TF-IDF |
| 15 | `ensemble` | Composite | Weighted ensemble of multiple scorers |
| 16 | `numeric_diff` | Numeric | Normalized numeric difference |
| 17 | `date_diff` | Date | Date difference in days |
| 18 | `boolean_match` | Boolean | Boolean equality |
| 19 | `llm` | AI | LLM-based boundary-pair resolution |

### ⑤ Clustering

Once pairwise scores are computed, clustering groups records into entities:

```typescript
import { connectedComponents, dbscanClustering, uniqueMapping } from '@agentix-e/entity-resolver-core';

// Connected Components: transitive closure
const cc = connectedComponents(scoredPairs, 0.7);

// DBSCAN: density-based
const dbscan = dbscanClustering(scoredPairs, { eps: 0.3, minPts: 2 });

// Unique Mapping: 1-to-1 correspondence
const um = uniqueMapping(scoredPairs, 0.7);
```

### ⑥ Evaluation: 12 Metrics

```typescript
import { evaluateClustering } from '@agentix-e/entity-resolver-core';

const metrics = evaluateClustering(predictedClusters, groundTruthClusters);

// Pairwise metrics
metrics.pairwisePrecision  // Precision of predicted pairs
metrics.pairwiseRecall     // Recall of true pairs
metrics.pairwiseF1         // F1 score

// Cluster metrics
metrics.clusterPrecision   // Cluster-level precision
metrics.clusterRecall      // Cluster-level recall
metrics.clusterF1          // Cluster-level F1

// B³ metrics (entity-level)
metrics.b3Precision
metrics.b3Recall
metrics.b3F1

// Agreement metrics
metrics.adjustedRandIndex   // ARI: chance-corrected Rand index
metrics.fowlkesMallows      // FMI: geometric mean of pairwise P/R
metrics.vMeasure            // Harmonic mean of homogeneity & completeness
```

## DI Interface Contracts

All I/O and persistence concerns are externalized through interfaces defined in `core`:

```typescript
interface IScorer {
  readonly name: string;
  score(a: unknown, b: unknown, field: FieldMetadata): number;
}

interface IEntityStore {
  getEntity(id: EntityId): Promise<EntityRecord | null>;
  queryNeighbors(id: EntityId, hops?: number): Promise<EntityRecord[]>;
  upsertEntity(entity: EntityRecord): Promise<void>;
  deleteEntity(id: EntityId): Promise<void>;
  applyMerge(from: EntityId, into: EntityId): Promise<void>;
  applySplit(entityId: EntityId, members: EntityId[][]): Promise<void>;
}
```

## WASM Acceleration

WASM is an **internal module** of `entity-resolver-core`. At startup, the scorer registry auto-detects WASM availability:

- **WASM available** → Rust-accelerated scorers (~5x faster)
- **WASM unavailable** → Pure JS fallback (transparent, zero-config)

Five scoring kernels are compiled from Rust to WASM: Levenshtein, Jaro, Jaro-Winkler, Dice, Soundex.

## PPRL: Privacy-Preserving Record Linkage

For GDPR/HIPAA compliance, PPRL enables matching without sharing plaintext data:

```typescript
import { BloomFilter, encodePPRL, matchPPRL } from '@agentix-e/entity-resolver-core';

const config = { size: 1024, numHashes: 10, qgramSize: 2 };
const bf1 = encodePPRL('John Smith', 'my-secret-salt', config);
const bf2 = encodePPRL('Jon Smyth', 'my-secret-salt', config);
const similarity = matchPPRL(bf1, bf2); // Dice coefficient on Bloom filters
```
