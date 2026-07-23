# @agentix-e/entity-resolver

**Industry-leading Entity Resolution for Node.js and Browser**

A stateless, pure-computation Entity Resolution engine with WASM acceleration. Built for TypeScript first, designed for any JavaScript runtime.

[![CI](https://github.com/AgentiX-E/entity-resolver/actions/workflows/ci.yml/badge.svg)](https://github.com/AgentiX-E/entity-resolver/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

## Philosophy

**Entity Resolution is pure computation.** `f(records) → {clusters, matchPairs, scores}`. No side effects. No I/O. No internal mutable state. Runs anywhere JavaScript runs.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| `entity-resolver-core` | Stateless computation engine with WASM acceleration and DI interface contracts | `@agentix-e/entity-resolver-core` |
| `entity-resolver-node` | Node.js adapters (FileDataSource, SqliteEntityStore, FileConfigStore) | `@agentix-e/entity-resolver-node` |
| `entity-resolver-browser` | Browser adapters (FetchDataSource, IndexedDBEntityStore, LocalStorageConfigStore) | `@agentix-e/entity-resolver-browser` |
| `entity-resolver-server` | Deployable HTTP/gRPC/MCP API service (stateless by default) | `@agentix-e/entity-resolver-server` |
| `entity-resolver-cli` | Command-line tool for deduplication, matching, and diagnostics | `@agentix-e/entity-resolver-cli` |
| `entity-resolver-visual` | Framework-agnostic, embeddable diagnostic components (3-layer: Data API + Headless + Web Components) | `@agentix-e/entity-resolver-visual` |
| `entity-resolver` | Umbrella facade — one import, all packages | `@agentix-e/entity-resolver` |

## Quick Start

```typescript
// Pure computation — zero I/O, runs anywhere
import { dedupe } from '@agentix-e/entity-resolver-core';

const records = [
  { name: 'John Smith',  dob: '1990-01-15', city: 'New York' },
  { name: 'Jon Smyth',   dob: '1990-01-15', city: 'NYC' },
  { name: 'Jane Doe',    dob: '1985-06-20', city: 'Los Angeles' },
];

const result = await dedupe(records);
// result.clusters:  { clusterId → recordIds }
// result.scores:    pairwise match probabilities
// result.diagnostics: waterfall data, histograms, m/u charts
```

```typescript
// Node.js — with file I/O and SQLite persistence
import { dedupeFromFile } from '@agentix-e/entity-resolver-node';

const result = await dedupeFromFile('customers.csv', {
  entityStore: 'sqlite:mydb.sqlite',
  autoconfigure: true,
});
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full architecture document, including:
- Stateless core design with DI interface contracts
- Fellegi-Sunter probabilistic model (EM algorithm)
- 5 blocking strategies + 19 scorers + 3 clustering algorithms
- 3-layer framework-agnostic visualization system
- Incremental update engine
- WASM acceleration via Rust → WASM (auto-fallback to pure JS)

## License

MIT © Lambertyan — [AgentiX-E](https://github.com/AgentiX-E)

---

📖 [Full Documentation](https://agentix-e.github.io/entity-resolver) — Guides, API Reference, Migration
