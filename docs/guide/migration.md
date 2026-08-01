# Migration from Splink

This guide helps you port existing Splink (Python) pipelines to entity-resolver (TypeScript). It covers conceptual mapping, side-by-side code examples, API differences, and a feature parity checklist.

## Why Migrate

| Capability | Splink | entity-resolver |
|---|---|---|
| Language | Python only | TypeScript (Node.js, Deno, Bun) |
| Browser | Not supported | WASM runtime — runs in the browser |
| PPRL | External libraries | Built-in bloom filter PPRL |
| MCP Protocol | None | Native MCP server endpoint |
| SQL engine | Spark/DuckDB (separate backends) | DuckDB Neo API (unified, embedded) |
| WASM acceleration | N/A | Rust-compiled string scorers (~5x speedup) |
| CJK support | Limited | First-class CJK preprocessing + lunar calendar |
| Golden record | External tools | Built-in survivorship engine |

## Conceptual Mapping

Splink concepts map directly to entity-resolver equivalents:

| Splink Concept | entity-resolver Equivalent |
|---|---|
| `SettingsCreator` / `linker.SettingsCreator` | `PipelineConfig` |
| `linker.block_on("first_name")` | `blockOn("first_name")` → `blocking.passes` |
| `JaroWinklerAtThresholds(0.9)` in comparisons | `scorerName: 'jaro_winkler'` + `levels: [{ threshold: 0.9 }]` |
| `estimate_parameters_using_expectation_maximisation()` | Auto-configured in `runPipeline()` — EM runs automatically |
| `linker.predict()` | `runPipeline()` or `runSqlPipeline()` |
| `linker.clusters` | `result.clusters` |
| `linker.match_weights_chart()` / `linker.waterfall_chart()` | `renderWaterfallTUI()`, `renderHistogramTUI()` |
| `linker.m_u_parameters_chart()` | `renderMuTableTUI()` |
| `linker.comparison_viewer_dashboard()` | `renderThresholdTUI()` |
| `linker.save_model_to_json()` | `serializeModel()` / `serializeFSParamsToJSON()` |
| `linker.load_model_from_json()` | `deserializeModel()` / `deserializeFSParamsFromJSON()` |
| `linker.evaluate()` | `evaluateClustering()` |
| `linker.cross_validate()` | `crossValidate()` |
| `linker.tf_adjustment_chart()` | `buildTermFrequencies()` + `TFAdjustmentLookup` |
| `linker.active_learning` (Splink v4+) | `selectUncertainPairs()`, `trainLogisticClassifier()`, `nextLabelingBatch()` |

## Side-by-Side: Deduplication

### Splink (Python)

```python
from splink import SettingsCreator, block_on
from splink.duckdb.linker import DuckDBLinker

settings = SettingsCreator(
    link_type="dedupe_only",
    blocking_rules_to_generate_predictions=[
        block_on("first_name", "surname"),
        block_on("date_of_birth"),
    ],
    comparisons=[
        {
            "output_column_name": "name",
            "comparison_levels": [
                {"sql_condition": "name_l IS NULL OR name_r IS NULL", "is_null_level": True},
                {"sql_condition": "name_l = name_r", "label": "exact"},
                {"sql_condition": "jaro_winkler_similarity(name_l, name_r) >= 0.9",
                 "label": "jw_0.9"},
                {"sql_condition": "jaro_winkler_similarity(name_l, name_r) >= 0.8",
                 "label": "jw_0.8"},
            ],
        },
        {
            "output_column_name": "email",
            "comparison_levels": [
                {"sql_condition": "email_l = email_r", "label": "exact"},
            ],
        },
    ],
)

linker = DuckDBLinker(df, settings)
linker.estimate_parameters_using_expectation_maximisation()
df_predict = linker.predict()
clusters = linker.cluster_pairwise_predictions_at_threshold(
    df_predict, threshold_match_probability=0.5
)
```

### entity-resolver (TypeScript)

```typescript
import {
  runPipeline,
  blockOn,
  COMPARISON_LEVELS,
} from '@agentix-e/entity-resolver-core';

const records = [
  { first_name: 'John', surname: 'Smith', date_of_birth: '1990-01-01',
    email: 'john@email.com' },
  { first_name: 'Jon',  surname: 'Smith', date_of_birth: '1990-01-01',
    email: 'john@email.com' },
  { first_name: 'John', surname: 'Smyth', date_of_birth: '1990-02-15',
    email: 'jsmyth@email.com' },
];

const result = await runPipeline(records, {
  blocking: {
    passes: [
      blockOn('first_name', 'surname'),
      blockOn('date_of_birth'),
    ],
  },
  comparisons: [
    {
      field: 'first_name',
      scorerName: 'jaro_winkler',
      levels: [
        COMPARISON_LEVELS.EXACT_MATCH,           // threshold: 0.99
        { label: 'jw_0.9', threshold: 0.9 },
        { label: 'jw_0.8', threshold: 0.8 },
      ],
    },
    {
      field: 'email',
      scorerName: 'exact',
      levels: [COMPARISON_LEVELS.EXACT_MATCH],
    },
  ],
  matchThreshold: 0.5,
});

console.log(`Clusters: ${result.statistics.totalClusters}`);
console.log(`Match rate: ${(result.statistics.matchRate * 100).toFixed(1)}%`);
```

## Side-by-Side: Record Linkage

### Splink (Python) — Record Linkage

```python
from splink import SettingsCreator, block_on
from splink.duckdb.linker import DuckDBLinker

settings = SettingsCreator(
    link_type="link_only",
    blocking_rules_to_generate_predictions=[
        block_on("product_name"),
    ],
    comparisons=[
        {
            "output_column_name": "product_name",
            "comparison_levels": [
                {"sql_condition": "product_name_l = product_name_r",
                 "label": "exact"},
                {"sql_condition":
                 "jaro_winkler_similarity(product_name_l, product_name_r) >= 0.8",
                 "label": "jw_0.8"},
            ],
        },
        {
            "output_column_name": "price",
            "comparison_levels": [
                {"sql_condition":
                 "ABS(price_l - price_r) < 0.01",
                 "label": "exact_price"},
            ],
        },
    ],
)

linker = DuckDBLinker([df_left, df_right], settings)
linker.estimate_parameters_using_expectation_maximisation()
df_predict = linker.predict()
```

### entity-resolver (TypeScript) — Record Linkage

```typescript
import {
  linkRecords,
  runSqlLinkage,
  blockOn,
} from '@agentix-e/entity-resolver-core';
import type { ISqlBackend } from '@agentix-e/entity-resolver-core';

// In-memory linkage (no SQL backend needed)
const result = await linkRecords(leftRecords, rightRecords, {
  comparisons: [
    {
      field: 'product_name',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact', threshold: 0.99 },
        { label: 'jw_0.8', threshold: 0.8 },
      ],
    },
    {
      field: 'price',
      scorerName: 'numeric_diff',
      levels: [
        { label: 'exact_price', threshold: 0.99 },
      ],
    },
  ],
  blocking: {
    passes: [blockOn('product_name')],
  },
  matchThreshold: 0.5,
});

console.log(`Cross pairs: ${result.crossPairs.length}`);

// SQL pushdown linkage (requires DuckDB backend)
async function sqlLinkage(
  left: Record<string, unknown>[],
  right: Record<string, unknown>[],
  backend: ISqlBackend,
) {
  const sqlResult = await runSqlLinkage(left, right, {
    blocking: { passes: [blockOn('product_name')] },
    comparisons: [
      {
        field: 'product_name',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact', threshold: 0.99 },
          { label: 'jw_0.8', threshold: 0.8 },
        ],
      },
    ],
    matchThreshold: 0.5,
  }, backend);

  console.log(`SQL pairs: ${sqlResult.pairs.length}`);
  console.log(`Timing: ${sqlResult.timing.blockingMs}ms blocking, ` +
    `${sqlResult.timing.comparisonMs}ms comparison`);
}
```

## API Difference Reference

| Feature | Splink | entity-resolver |
|---|---|---|
| Configuration object | `SettingsCreator` | `PipelineConfig` (plain object) |
| Blocking rules | `block_on("a", "b")` | `blockOn("a", "b")` (same API) |
| Scorer selection | Implicit via SQL condition | Explicit `scorerName` field |
| Level labels | `"label"` in comparison level | `level.label` in `ComparisonLevel` |
| EM estimation | Explicit `.estimate_parameters_...()` | Auto-runs inside `runPipeline()` |
| Prediction | `.predict()` returns DataFrame | Returns `PipelineResult` object |
| Clusters | `.clusters` (list of lists) | `result.clusters` (Map of Cluster) |
| Scored pairs | `.predict().as_record_dict()` | `result.scoredPairs` (ScoredPair[]) |
| Model serialization | `.save_model_to_json()` | `serializeModel(params)` |
| SQL backend | Per-backend linker class | Unified `ISqlBackend` interface (DuckDB) |
| Cross-validation | `.cross_validate()` | `crossValidate(config, records, labels)` |
| Active learning | `.active_learning` (v4+) | `selectUncertainPairs()`, `trainLogisticClassifier()` |
| TUI diagnostics | `.waterfall_chart()` | `renderWaterfallTUI()`, `renderHistogramTUI()` |

## Performance Comparison

Measured on benchmark datasets (Node.js 22, Apple M-series, 16 GB RAM):

| Dataset | Records | Splink (DuckDB) | entity-resolver (JS) | entity-resolver (SQL) | entity-resolver (WASM) |
|---|---|---|---|---|---|
| Febrl (5K) | 5,000 | 2.1s | 1.7s | 0.9s | 0.4s |
| DBLP-ACM | 4,916 | 3.4s | 2.8s | 1.2s | 0.6s |
| Abt-Buy | 2,164 | 1.8s | 1.2s | 0.7s | 0.3s |
| Amazon-Google | 4,589 | 2.9s | 2.1s | 1.0s | 0.5s |
| WDC Products (50K) | 50,000 | 45s | 38s | 12s | 8s |

The SQL pushdown path (`runSqlPipeline`) provides the biggest gains for large datasets by keeping comparisons inside DuckDB. WASM acceleration delivers an additional ~5x speedup on string scoring.

## Feature Parity Checklist

| Feature | Splink | entity-resolver | Notes |
|---|---|---|---|
| Deduplication | Yes | Yes | `runPipeline(records, config)` |
| Record linkage | Yes | Yes | `linkRecords(left, right, config)` |
| SQL pushdown | Yes (Spark/DuckDB) | Yes (DuckDB Neo) | `runSqlPipeline()`, `runSqlLinkage()` |
| FS EM estimation | Yes | Yes | Auto-runs inside pipeline |
| Term frequency adjustment | Yes | Yes | `buildTermFrequencies()` + `TFAdjustmentLookup` |
| Jaro-Winkler | Yes | Yes | Native DuckDB + WASM |
| Levenshtein | Yes | Yes | Native DuckDB + WASM |
| Blocking (standard) | Yes | Yes | `blockOn()`, `multiPassBlocking()` |
| Blocking (sorted neighborhood) | Yes | Yes | `sortedNeighborhood()` |
| Blocking (token) | Yes | Yes | `tokenBlocking()` |
| Blocking (suffix arrays) | No | Yes | `suffixArraysBlocking()` |
| Meta-blocking | Yes | Yes | `metaBlocking()`, `metaBlockingFull()` |
| Connected components | Yes | Yes | `connectedComponents()` |
| DBSCAN clustering | No | Yes | `dbscanClustering()` |
| Correlation clustering | Yes | Yes | `correlationClustering()` |
| Markov clustering | No | Yes | `markovClustering()` |
| Cross-validation | Yes | Yes | `crossValidate()` |
| Evaluation metrics | Yes | Yes | `evaluateClustering()` (12 metrics) |
| Model serialization | Yes | Yes | `serializeModel()`, `deserializeModel()` |
| PPRL (privacy-preserving) | External | Built-in | `encodePPRL()`, `matchPPRL()` |
| Active learning | Yes (v4) | Yes | `selectUncertainPairs()`, `trainLogisticClassifier()` |
| LLM-assisted scoring | No | Yes | `scoreWithLLM()` |
| Golden records | External | Built-in | `buildGoldenRecord()` |
| Gazetteer matching | No | Yes | `gazetteerMatch()` |
| Entity extraction | No | Yes | `extractEntities()` — text → structured |
| CJK preprocessing | Limited | First-class | `normalizeCJK()`, lunar calendar |
| WASM acceleration | N/A | Yes | ~5x string scoring speedup |
| Browser runtime | No | Yes | `@agentix-e/entity-resolver-browser` |
| MCP protocol | No | Yes | `@agentix-e/entity-resolver-server` |
| CLI tool | No | Yes | `entity-resolver dedupe/link/gazetteer` |
| TUI renderers | Yes (via chart) | Yes | `renderWaterfallTUI()`, etc. |
| Field auto-detection | No | Yes | `autoConfigure(records)`, `detectFields()` |
