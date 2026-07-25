# Migration Guide — Splink → @agentix-e/entity-resolver

This guide helps Splink users migrate their entity resolution pipelines to entity-resolver.

## Quick Comparison

| Concept | Splink (Python) | entity-resolver (TypeScript) |
|---------|-----------------|------------------------------|
| Linker | `DuckDBLinker(df, settings)` | `runPipeline(records, config)` |
| Blocking | `blocking_rules_to_generate_predictions` | `blocking.passes[]` |
| Comparisons | `comparison_library` | `comparisons[]` |
| EM training | `estimate_parameters_using_expectation_maximisation()` | `estimateParameters(vectors)` (built-in) |
| Predict | `linker.predict()` | `runPipeline()` returns `scoredPairs` |
| Clusters | `linker.cluster_pairwise_predictions_at_threshold()` | `connectedComponents(pairs, threshold)` |
| Diagnostics | Waterfall chart, comparison viewer | `<er-dashboard>` or `buildWaterfallData()` |

## Step-by-step Migration

### 1. Blocking rules

**Splink:**
```python
"blocking_rules_to_generate_predictions": [
    "l.email = r.email",
    "l.surname = r.surname and l.city = r.city",
]
```

**entity-resolver:**
```typescript
const config = {
  blocking: {
    passes: [
      { fields: ['email'], transforms: ['strip', 'lowercase'] },
      { fields: ['surname', 'city'], transforms: ['strip', 'lowercase'] },
    ],
  },
};
```

### 2. SQL blocking (DuckDB)

entity-resolver also supports **SQL-based blocking** for large datasets:

```typescript
const { DuckDbSqlBackend } = require('@agentix-e/entity-resolver-node');
const backend = new DuckDbSqlBackend();

const blockingResult = await sqlBlocking(records, backend, {
  rules: ['l.email = r.email', 'l.surname = r.surname AND l.city = r.city'],
});
```

### 3. Comparison specs

**Splink:**
```python
cl.exact_match("email"),
cl.jaro_winkler_at_thresholds("first_name", [0.9, 0.7]),
```

**entity-resolver:**
```typescript
const comparisons = [
  { field: 'email', scorerName: 'exact', levels: [{ label: 'exact_match', threshold: 0.99 }] },
  { field: 'first_name', scorerName: 'jaro_winkler', levels: [
      { label: 'exact_match', threshold: 0.99 },
      { label: 'strong_match', threshold: 0.85 },
    ]},
];
```

### 4. Term frequency adjustment

**Splink:** Built into the model via `term_frequency_adjustments`.

**entity-resolver:**
```typescript
const config = {
  tfFields: ['surname', 'city'],
};
```

### 5. Threshold prediction

**Splink:**
```python
pairwise = linker.predict(threshold_match_probability=0.9)
clusters = linker.cluster_pairwise_predictions_at_threshold(pairwise, 0.95)
```

**entity-resolver:**
```typescript
const result = await runPipeline(records, {
  ...config,
  matchThreshold: 0.5,
});
// result.clusters, result.scoredPairs, result.statistics
```

### 6. Diagnostics

**Splink:**
```python
linker.visualisations.waterfall_chart(...)
linker.comparison_viewer_dashboard(...)
```

**entity-resolver:**
```typescript
// Server endpoint
// GET /dashboard → full interactive panel

// Or programmatic
import { exportDashboardHTML } from '@agentix-e/entity-resolver-visual';
fs.writeFileSync('report.html', exportDashboardHTML(result, records));
```

### 7. Unique Advantages

| Feature | Splink | entity-resolver |
|---------|:---:|:---:|
| TypeScript/JavaScript | ❌ | ✅ |
| Browser (WASM) | ❌ | ✅ |
| MCP AI agent protocol | ❌ | ✅ |
| PPRL (privacy) | ❌ | ✅ |
| Golden records | ❌ | ✅ |
| Active learning | ❌ | ✅ |
| LLM scoring | ❌ | ✅ |
| SQL backends | DuckDB/Spark/PG | DuckDB/PG |
| HTML dashboard | ✅ | ✅ |
| Multi-backend SQL | ✅ | ✅ |

## License

Both projects are MIT licensed.
