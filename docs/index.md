---
layout: home

hero:
  name: Entity Resolution
  text: Industry-Leading ER for Node.js & Browser
  tagline: Stateless pure-computation engine with WASM acceleration. TypeScript-first. Zero I/O in core. Runs anywhere.
  image:
    src: /logo.svg
    alt: Entity Resolution
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/AgentiX-E/entity-resolver

features:
  - icon: 🧠
    title: Fellegi-Sunter Probabilistic Model
    details: Full EM algorithm for m/u parameter estimation with match weight computation, term frequency adjustment, and field independence diagnostics.
  - icon: ⚡
    title: WASM Acceleration
    details: 5 Rust-compiled scoring kernels (Levenshtein, Jaro, Jaro-Winkler, Dice, Soundex) with auto-fallback to pure JS. ~5x speedup.
  - icon: 🔌
    title: Stateless Core + DI
    details: Pure computation engine with DI interface contracts. Same core runs in Node.js, browsers, Edge Functions, Deno, Bun, and Cloudflare Workers.
  - icon: 🔒
    title: PPRL & Privacy-First
    details: Privacy-Preserving Record Linkage via Bloom filter encoding with SHA256-salted hashing. GDPR/HIPAA compliant out of the box.
  - icon: 🤖
    title: LLM-Powered Scoring
    details: Optional LLM scorer for boundary-pair resolution. Uses DeepSeek API — configurable via environment variable, never in code.
  - icon: 📊
    title: 12 Evaluation Metrics
    details: Pairwise P/R/F1, cluster P/R/F1, B³ P/R/F1, ARI, FMI, V-measure. Full diagnostic waterfall with histograms and m/u charts.
  - icon: 🗄️
    title: 4 Storage Backends
    details: In-memory (zero-dependency), DuckDB embedded (Node.js), PostgreSQL with mTLS, DuckDB WASM (browser) with 4-tier enterprise distribution.
  - icon: 🚀
    title: Production Ready
    details: Docker images, Hono REST API, MCP tools, auth middleware, rate limiting, health monitoring, incremental update engine.
---

## Quick Example

```typescript
import { runPipeline } from '@agentix-e/entity-resolver-core';

const records = [
  { name: 'John Smith',  dob: '1990-01-15', city: 'New York' },
  { name: 'Jon Smyth',   dob: '1990-01-15', city: 'NYC' },
  { name: 'Jane Doe',    dob: '1985-06-20', city: 'Los Angeles' },
];

const result = await runPipeline(records, {
  blocking: {
    passes: [{ fields: ['name', 'dob'], transforms: ['strip', 'lowercase'] }],
  },
  comparisons: [
    { field: 'name', scorer: 'jaro_winkler', weight: 0.5 },
    { field: 'dob',  scorer: 'exact',        weight: 0.5 },
  ],
  matchThreshold: 0.7,
  autoConfigure: true,
});

console.log(result.clusters);      // { clusterId → RecordId[] }
console.log(result.scoredPairs);   // pairwise probabilities
console.log(result.diagnostics);   // waterfall, histograms, m/u charts
```

## By the Numbers

| Metric | Value |
|--------|-------|
| Scorers | 19 (12 strsimkit + 7 custom) |
| Blocking Strategies | 5 (Standard, Token, Sorted Neighborhood, Multi-pass, Meta-blocking) |
| Clustering Algorithms | 3 (Connected Components, DBSCAN, Unique Mapping) |
| Evaluation Metrics | 12 (Pairwise, Cluster, B³, ARI, FMI, V-measure) |
| WASM Kernels | 5 (Rust → WASM, ~5x speedup) |
| Storage Backends | 4 (Memory, DuckDB, PostgreSQL, DuckDB WASM) |
| Benchmarked Datasets | 8 (FEBRL, DBLP-ACM, Abt-Buy, Amazon-Google, WDC, iTunes-Amazon, Cora) |
| Test Coverage (core) | 94.4% statements, 87.7% branches |
