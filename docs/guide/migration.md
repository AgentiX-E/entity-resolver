# Migrating from Splink / GoldenMatch

## Splink → @agentix-e/entity-resolver

Splink (Python, PySpark) is the most popular open-source ER library. Our TypeScript/Node.js engine provides architectural parity with a different runtime.

### Conceptual Mapping

| Splink Concept | entity-resolver Equivalent |
|---------------|------------------------------|
| `Linker` | `runPipeline()` |
| `SettingsCreator` | `PipelineConfig` (comparisons, blocking rules) |
| `comparison_levels` | `ComparisonLevel` with `ComparisonSpec` |
| `blocking_rules` | `BlockingPass[]` in `BlockingConfig` |
| `EM training session` | `estimateParameters()` |
| `m_probabilities` / `u_probabilities` | `FSParameters.mParams` / `FSParameters.uParams` |
| `match_weight` | `computeMatchWeight()` |
| `match_probability` | `weightToProbability()` |
| `term_frequency_adjustments` | `adjustWeightByTF()` |
| `waterfall chart` | `DiagnosticData.matchWeightBins` |
| `cluster()` | `connectedComponents()` |
| `truth_space_table` | `evaluateClustering()` |
| `comparison_viewer` | `generateComparisonVectors()` |
| `deterministic_rules` | `scorer: 'exact'` with high threshold |

### API Migration: Basic Deduplication

**Splink (Python):**
```python
from splink.duckdb.linker import DuckDBLinker
import splink.duckdb.comparison_library as cl

settings = {
    "link_type": "dedupe_only",
    "comparisons": [
        cl.name_comparison("name"),
        cl.jaro_winkler_at_thresholds("city", 0.9),
    ],
    "blocking_rules_to_generate_predictions": [
        "l.name = r.name",
    ],
}
linker = DuckDBLinker(df, settings)
linker.estimate_u_using_random_sampling(max_pairs=1e6)
linker.estimate_m_from_pairwise_labels(table)
results = linker.predict()
clusters = linker.cluster_pairwise_predictions_at_threshold(results, 0.9)
```

**entity-resolver (TypeScript):**
```typescript
import { runPipeline, estimateParameters } from '@agentix-e/entity-resolver-core';

const result = await runPipeline(records, {
  blocking: {
    passes: [{ fields: ['name'], transforms: ['strip', 'lowercase'] }],
  },
  comparisons: [
    { field: 'name', scorer: 'jaro_winkler', weight: 0.5 },
    { field: 'city', scorer: 'jaro_winkler', weight: 0.5 },
  ],
  matchThreshold: 0.9,
  autoConfigure: true,  // auto-estimates m/u via EM
});
```

### Key Differences

| Feature | Splink | entity-resolver |
|---------|--------|-------------------|
| **Language** | Python (PySpark optional) | TypeScript/Node.js |
| **Backend** | DuckDB / Spark / Athena | DuckDB / PostgreSQL / Memory / WASM |
| **State** | Stateful `Linker` object | Stateless `runPipeline()` |
| **EM Training** | Explicit `estimate_*` calls | Auto (via `autoConfigure: true`) or explicit |
| **Blocking** | SQL expressions as strings | Structured `BlockingPass[]` config |
| **I/O** | Reads/writes directly | DI interfaces (no I/O in core) |
| **Browser** | ❌ Not available | ✅ DuckDB WASM |
| **PPRL** | ❌ Not built-in | ✅ Bloom filter PPRL |
| **LLM Scoring** | ❌ Not built-in | ✅ Optional LLM scorer |
| **MCP Tools** | ❌ Not available | ✅ Built-in MCP server |
| **mTLS** | Depends on driver | ✅ First-class support |

## GoldenMatch → @agentix-e/entity-resolver

GoldenMatch is a commercial ER product. Our engine matches or exceeds its core capabilities.

### Conceptual Mapping

| GoldenMatch Concept | entity-resolver Equivalent |
|--------------------|------------------------------|
| Match Engine | `runPipeline()` |
| Scoring Suite (20+ algorithms) | 19 scorers (all modern algorithms covered) |
| Blocking Engine | 5 blocking strategies |
| Entity Store | `IEntityStore` (4 backends) |
| Cluster Management | `connectedComponents()` / `dbscanClustering()` |
| Merge/Split API | `IEntityStore.applyMerge()` / `applySplit()` |
| REST API | `createApp()` (Hono) |
| Batch Processing | `runPipeline()` (stateless, parallelizable) |
| Real-time API | `POST /api/dedupe` |
| Incremental Updates | `incrementalAdd()` / `incrementalDelete()` / `incrementalModify()` |
| PPRL | `encodePPRL()` / `matchPPRL()` |

### Architecture Differences

| Dimension | GoldenMatch | entity-resolver |
|-----------|-------------|-------------------|
| **License** | Commercial | MIT |
| **Core Design** | Stateful service | Stateless pure functions |
| **Embeddability** | REST API only | npm package + REST API |
| **Dependencies** | Java runtime | Node.js 22+ (zero JVM) |
| **Cold Start** | Service startup | `import { runPipeline }` |
| **Customization** | Configuration-driven | Code-driven (DI + custom scorers) |
| **Offline** | Requires service | ✅ Fully offline (core + DuckDB) |
| **Edge/Serverless** | ❌ Heavyweight | ✅ Zero-I/O core, runs anywhere |

## Migration Checklist

### Phase 1: Evaluation
- [ ] Run both systems on your dataset and compare F1 scores
- [ ] Verify clustering output matches within acceptable tolerance
- [ ] Compare runtime performance on representative data sizes

### Phase 2: Feature Parity
- [ ] Map existing blocking rules to `BlockingPass[]` configs
- [ ] Map existing comparison/scoring configs to `ComparisonSpec[]`
- [ ] Set up equivalent storage backend (Memory → DuckDB → PostgreSQL)
- [ ] Configure equivalent match thresholds

### Phase 3: Production Cutover
- [ ] Set up PostgreSQL with mTLS (if applicable)
- [ ] Deploy Docker container with REST API
- [ ] Configure auth and rate limiting
- [ ] Set up health monitoring
- [ ] Run parallel pipelines for validation period
- [ ] Cut over traffic

## Getting Help

- [API Reference](/api/core/) — Full typed API documentation
- [GitHub Issues](https://github.com/AgentiX-E/entity-resolver/issues)
- [Core Concepts](/guide/core-concepts) — Algorithm deep-dives
