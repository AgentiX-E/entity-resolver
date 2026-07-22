# @agentix-e/entity-resolution-core

**Stateless computation engine with WASM acceleration and DI interface contracts.**

The core package is the heart of the entity resolution system. It defines all algorithm logic and DI interface contracts, but performs **zero I/O** and holds **zero mutable state**.

## Installation

```bash
npm install @agentix-e/entity-resolution-core
```

## Key Modules

| Module | Description |
|--------|-------------|
| Pipeline | `runPipeline()` — main entry point for the ER pipeline |
| Scorers | 19 built-in comparators (exact, levenshtein, jaro_winkler, ensemble, etc.) |
| Blocking | 5 blocking strategies (standard, token, sorted neighborhood, multi-pass, meta) |
| Fellegi-Sunter | EM parameter estimation, match weight computation, TF adjustment |
| Clustering | Connected components, DBSCAN, unique mapping |
| Evaluation | 12 metrics (pairwise P/R/F1, cluster P/R/F1, B³, ARI, FMI, V-measure) |
| Preprocessing | Unicode repair, normalization, email/phone standardization |
| PPRL | Privacy-preserving record linkage via Bloom filters |
| LLM Scorer | Optional LLM-based boundary-pair scoring |
| Active Learning | Uncertainty sampling, logistic classifier, label management |
| Auto-Config | Automatic field detection and pipeline configuration |
| Incremental | Incremental add, delete, modify for live entity graphs |
| Benchmarks | 8 benchmark datasets (FEBRL, DBLP-ACM, etc.) with runner |
| Types | Core type definitions (RecordId, ScoredPair, Cluster, etc.) |

## Quick Example

```typescript
import { runPipeline } from '@agentix-e/entity-resolution-core';

const result = await runPipeline(records, {
  blocking: { passes: [{ fields: ['name'], transforms: ['strip', 'lowercase'] }] },
  comparisons: [{ field: 'name', scorer: 'jaro_winkler', weight: 1.0 }],
  matchThreshold: 0.7,
  autoConfigure: true,
});
```

## Complete API Reference

→ [Full auto-generated API reference](/api/core/reference) (all exports, types, and signatures)
