# @agentix-e/entity-resolver

**Entity Resolver for Node.js and Browser**

A stateless, pure-computation entity resolver engine with WASM acceleration. Built for TypeScript first, designed for any JavaScript runtime.

[![CI](https://github.com/AgentiX-E/entity-resolver/actions/workflows/ci.yml/badge.svg)](https://github.com/AgentiX-E/entity-resolver/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

## Philosophy

**Entity Resolver is the unified TypeScript entity processing platform.** Three pipelines, one engine:

1. **extract** — Text → Structured Entities (schema-driven, pattern-first, LLM-optional)
2. **resolve** — Records → Clusters (probabilistic record linkage + deduplication)
3. **link** — Entity → KB ID (gazetteer-first private KB linking)

Pure computation. No side effects. No I/O. No internal mutable state. Runs anywhere JavaScript runs.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| `entity-resolver-core` | Stateless computation engine with WASM acceleration and DI interface contracts | `@agentix-e/entity-resolver-core` |
| `entity-resolver-extract` | Schema-driven entity extraction engine (pattern + ONNX + LLM cascade) | `@agentix-e/entity-resolver-extract` |
| `entity-resolver-link` | Schema-aware private KB entity linking (gazetteer-first) | `@agentix-e/entity-resolver-link` |
| `entity-resolver-node` | Node.js adapters (FileDataSource, SqliteEntityStore, FileConfigStore) | `@agentix-e/entity-resolver-node` |
| `entity-resolver-browser` | Browser adapters (FetchDataSource, IndexedDBEntityStore, LocalStorageConfigStore) | `@agentix-e/entity-resolver-browser` |
| `entity-resolver-server` | Deployable HTTP/gRPC/MCP API service (stateless by default) | `@agentix-e/entity-resolver-server` |
| `entity-resolver-cli` | Command-line tool for deduplication, matching, and extraction | `@agentix-e/entity-resolver-cli` |
| `entity-resolver-visual` | Framework-agnostic, embeddable diagnostic components (3-layer: Data API + Headless + Web Components) | `@agentix-e/entity-resolver-visual` |
| `entity-resolver` | Umbrella facade — one import, all packages | `@agentix-e/entity-resolver` |

## Quick Start

### Entity Extraction (Text → Structured)

```typescript
import { extract } from '@agentix-e/entity-resolver-extract';

const result = extract(
  'Contact john@example.com or call +86-138-0000-0000, price: $99.99',
  [
    { name: 'email', type: 'email' },
    { name: 'phone', type: 'phone' },
    { name: 'price', type: 'number' },
  ],
);

// result.values = { email: 'john@example.com', phone: '+86-138-0000-0000', price: 99.99 }
// result.provenance = { email: 'pattern', phone: 'pattern', price: 'pattern' }
```

**Extraction features:**
- 8 built-in field types: email, phone, url, number, integer, boolean, date, time
- CJK temporal parsing (Chinese/Japanese/Korean calendar systems)
- Intent-enhanced mode (alarm/reminder/schedule/message/search)
- Multi-turn slot inheritance for dialog
- LLM fallback via DeepSeek API (optional)
- CLI: `er extract --text "下午3点开会" --fields time:time,title:string --intent meeting`

### Entity Resolution (Deduplication)
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
