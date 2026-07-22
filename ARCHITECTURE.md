# Architecture — @agentix-e/entity-resolution

## Design Principle: Stateless Core

The `entity-resolution-core` package is a **pure computation engine**. It defines all algorithm logic and DI (Dependency Injection) interface contracts, but performs zero I/O and holds zero mutable state.

```
f(records) → {clusters, matchPairs, scores, diagnostics}
```

This enables the same core to run in Node.js, browsers, Edge Functions, Deno, Bun, and Cloudflare Workers — without modification.

## Interface Contracts (DI)

All I/O and persistence concerns are externalized through interfaces defined in `entity-resolution-core`:

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
entity-resolution-core  (stateless, zero I/O)
  ↑                     ↑
entity-resolution-node  entity-resolution-browser
  ↑                     
entity-resolution-server
  ↑
entity-resolution (umbrella)
```

`entity-resolution-visual` and `entity-resolution-cli` depend only on `entity-resolution-core` (via its types), not on node/browser/server.

## WASM Acceleration

WASM acceleration is an **internal module** of `entity-resolution-core` (`core/src/matching/scorers/wasm/`). At startup, the `ScorerRegistry` auto-detects WASM availability:

- WASM available → Rust-accelerated scorers (~5x faster)
- WASM unavailable → Pure JS fallback (transparent, zero-config)

WASM binaries are distributed via platform-specific `optionalDependencies` (`@agentix-e/entity-resolution-core-linux-x64`, etc.). npm automatically installs the matching platform binary.

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

## Clustering Algorithms (3)

1. **Connected Components** — Union-Find transitive closure (< 100ms for 1M pairs)
2. **DBSCAN** — Density-based with adaptive epsilon
3. **Unique Mapping** — Greedy one-to-one assignment

## Evaluation System (12 Metrics)

`pairwisePrecision`, `pairwiseRecall`, `pairwiseF1`, `clusterPrecision`, `clusterRecall`, `clusterF1`, `bCubedPrecision`, `bCubedRecall`, `bCubedF1`, `adjustedRandIndex`, `fowlkesMallowsIndex`, `vMeasure`

All metrics verified against Python ER-Evaluation output (error < 1e-6).

## Visual Layer (Framework-Agnostic, Embeddable)

The `entity-resolution-visual` package uses a progressive 3-layer design:

- **Layer 1: Data API** — Pure functions returning typed JSON (`buildWaterfallData()`, `buildHistogramData()`, etc.). Users render with D3/ECharts/Chart.js/Recharts.
- **Layer 2: Headless Components** — Renderless state machines (`useWaterfall()`, `useHistogram()`, etc.). Users provide their own rendering.
- **Layer 3: Themeable Web Components** — `<er-waterfall>`, `<er-histogram>`, `<er-cluster-explorer>`, `<er-mu-chart>`, `<er-evaluation-radar>`. ≥20 CSS Custom Properties. Works in React, Vue, Svelte, and vanilla HTML.

## Iteration Plan (11 iterations, 24 weeks)

| Iteration | Focus | Priority |
|-----------|-------|----------|
| I0 | Foundation — monorepo scaffold, CI/CD, type system | P0 |
| I1 | Match Engine + Preprocessing — 19 scorers, FTfy-equivalent Unicode repair | P0 |
| I2 | FS Core — Fellegi-Sunter EM, Match Weight, TF Adjustment | P0 |
| I3 | Blocking — 5 strategies | P0 |
| I4 | Clustering + Evaluation — 3 algorithms, 12 metrics | P0 |
| I5 | Pipeline + Benchmarks — End-to-end, 8 standard datasets | P0 |
| I6 | Auto-Config — Zero-config semantic field detection | P0 |
| I7 | Visual Layer 1 — Data API (pure JSON diagnostic output) | P1 |
| I8 | Visual Layer 2+3 — Headless + Web Components | P1 |
| I9 | Diagnostics TUI — CLI terminal diagnostics | P1 |
| I10 | Active Learning — Uncertainty sampling + labeling loop | P1 |
| I11 | Production — REST/gRPC/MCP API, entity graph persistence, incremental updates, WASM publish | P2 |

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and iteration workflow.
