# Architecture — @agentix-e/entity-resolver

## Design Principle: Stateless Core

The `entity-resolver-core` package is a **pure computation engine**. It defines all algorithm logic and DI (Dependency Injection) interface contracts, but performs zero I/O and holds zero mutable state.

```
f(records) → {clusters, matchPairs, scores, diagnostics}
```

This enables the same core to run in Node.js, browsers, Edge Functions, Deno, Bun, and Cloudflare Workers — without modification.

## Interface Contracts (DI)

All I/O and persistence concerns are externalized through interfaces defined in `entity-resolver-core`:

```typescript
interface IDataSource {
  read(options: ReadOptions): AsyncIterable<ArrowRecordBatch>;
  schema(): ArrowSchema;
}

interface IEntityStore {
  getEntity(id: EntityId): Promise<EntityRecord | null>;
  queryNeighbors(id: EntityId, hops?: number): Promise<EntityRecord[]>;
  upsertEntity(entity: EntityRecord): Promise<void>;
  deleteEntity(id: EntityId): Promise<void>;
  applyMerge(from: EntityId, into: EntityId): Promise<void>;
  applySplit(entityId: EntityId, members: EntityId[][]): Promise<void>;
}

interface IConfigStore {
  load(name: string): Promise<ResolvedConfig>;
  save(name: string, config: ResolvedConfig): Promise<void>;
  list(): Promise<string[]>;
}

interface IScorer {
  readonly name: string;
  score(a: unknown, b: unknown, field: FieldMetadata): number;
}
```

Implementations:
- **Node.js**: `FileDataSource`, `SqliteEntityStore`, `FileConfigStore`
- **Browser**: `FetchDataSource`, `FileReaderDataSource`, `IndexedDBEntityStore`, `LocalStorageConfigStore`
- **Memory (built into core)**: `MemoryEntityStore`, `MemoryConfigStore` — pure JS reference implementations

## Package Dependency Graph

```
entity-resolver-core       (stateless, zero I/O — DI interfaces + algorithms)
  ↑      ↑      ↑      ↑
  │      │      │      │
  │      │      │  entity-resolver-visual  (framework-agnostic Web Components)
  │      │      │
  │      │  entity-resolver-extract        (pattern + ONNX + LLM cascade)
  │      │  entity-resolver-link           (gazetteer-first private KB linking)
  │      │
  │  entity-resolver-node    entity-resolver-browser
  │         ↑
  │  entity-resolver-server  (REST/gRPC/MCP)
  │         ↑
  entity-resolver (umbrella facade — re-exports all)
```

`entity-resolver-cli` depends on `entity-resolver-core` + `entity-resolver-extract`.
`entity-resolver-visual` depends only on `entity-resolver-core` (type references).

## WASM Acceleration

WASM acceleration is an **internal module** of `entity-resolver-core` (`core/src/matching/scorers/wasm/`). At startup, the `ScorerRegistry` auto-detects WASM availability:

- WASM available → Rust-accelerated scorers (~5x faster)
- WASM unavailable → Pure JS fallback (transparent, zero-config)

WASM binaries are distributed via platform-specific `optionalDependencies` (`@agentix-e/entity-resolver-core-linux-x64`, etc.). npm automatically installs the matching platform binary.

## Fellegi-Sunter Probabilistic Model

The core matching engine implements the Fellegi-Sunter model with EM (Expectation-Maximization) parameter estimation:

- **m-probability**: P(observation | records match) — measures data quality
- **u-probability**: P(observation | records do not match) — measures coincidence
- **Match weight**: `log2(m/u)` per field, additive across independent fields
- **Match probability**: `2^M / (1 + 2^M)`

### Term Frequency Adjustment

High-frequency values (e.g., common surname "Smith") receive reduced match weights to prevent false positives.

## Blocking Strategies (5)

1. **Standard Blocking** — SQL-style `block_on("first_name", "surname")` with multi-rule UNION
2. **Token Blocking** — Token-based blocks with lazy clustering
3. **Sorted Neighborhood** — Sliding window over sorted keys, adaptive window size
4. **Multi-pass Blocking** — Multiple independent passes (exact + soundex + substring)
5. **Meta-blocking** — Token Blocking → Block Purging → CNP → Meta-blocking pipeline (from pyJedAI)

## Scorers (19)

`exact`, `levenshtein`, `damerauLevenshtein`, `jaro`, `jaroWinkler`, `dice`, `jaccard`, `overlap`, `lcs`, `soundex`, `doubleMetaphone`, `tokenSort`, `tfidfCosine`, `qgramTfIdf`, `ensemble`, `numericDiff`, `dateDiff`, `booleanMatch`, `radial`

## Clustering Algorithms (12)

**Base algorithms (3):**
1. **Connected Components** — Union-Find transitive closure
2. **DBSCAN** — Density-based with adaptive epsilon
3. **Unique Mapping** — Greedy one-to-one assignment

**pyJedAI-ported algorithms (9):**
Center, Best Match, Merge Center, Correlation, Cut (Gomory-Hu), Markov (MCL), Kiraly MSM, Ricochet SR, Row-Column

## Blocking Strategies (8)

Standard, Token, Sorted Neighborhood, Multi-Pass, Meta-blocking, Suffix Arrays, Extended Q-Grams, TF-IDF

## Evaluation System (12 Metrics)

`pairwisePrecision`, `pairwiseRecall`, `pairwiseF1`, `clusterPrecision`, `clusterRecall`, `clusterF1`, `bCubedPrecision`, `bCubedRecall`, `bCubedF1`, `adjustedRandIndex`, `fowlkesMallowsIndex`, `vMeasure`

All metrics verified against Python ER-Evaluation output (error < 1e-6).

## Visual Layer (Framework-Agnostic, Embeddable)

The `entity-resolver-visual` package uses a progressive 3-layer design:

- **Layer 1: Data API** — Pure functions returning typed JSON. Users render with D3/ECharts/Chart.js/Recharts.
- **Layer 2: Headless Components** — Renderless state machines. Users provide their own rendering.
- **Layer 3: Themeable Web Components** — `<er-waterfall>`, `<er-histogram>`, `<er-cluster-explorer>`, `<er-mu-chart>`, `<er-evaluation-radar>`. ≥20 CSS Custom Properties. Works in React, Vue, Svelte, vanilla HTML.
- **Layer 4: Interactive Labeling** — `<er-labeling-session>`, `<er-pair-review>` (via dedicated `entity-resolver-studio` package, depends on core + visual + browser).

## Iteration History (Complete — I0 through I19 + O1-O5)

| Phase | Iterations | Status |
|-------|-----------|--------|
| Foundation (I0-I11) | 12 iterations | ✅ Complete |
| Extract Pipeline (I12-I19) | 8 iterations | ✅ Complete |
| Enterprise Hardening (O1-O5) | 5 iterations | ✅ Complete |

See [BENCHMARKS.md](BENCHMARKS.md) for current benchmark results.
