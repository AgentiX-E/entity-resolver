# entity-resolver

**Entity resolution for Node.js and the browser — DuckDB-powered, TypeScript-first.**

Identifies duplicate records across datasets without unique identifiers. Runs Fellegi-Sunter probabilistic matching with DuckDB SQL pushdown for linear O(N) scaling at 500K+ records/second.

```bash
npm install @agentix-e/entity-resolver-core @agentix-e/entity-resolver-node
```

## Performance

| Scale | Records | Time | Throughput |
|-------|--------|------|-----------|
| 100K  | 120,000 | 0.3s | 400K rec/s |
| 500K  | 600,000 | 1.1s | 545K rec/s |
| **1M** | **1,200,000** | **2.2s** | **545K rec/s** |

*2-field jaro_winkler, DuckDB SQL pushdown. See [Benchmarks](benchmarks/).*

## Quick Start

```ts
import { runPipeline, autoConfigure } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

const records = [
  { name: 'John Smith', city: 'NYC' },
  { name: 'Jon Smith',  city: 'NYC' },
  { name: 'Jane Doe',   city: 'LA'  },
];

// Auto-detect fields and blocking strategy
const config = autoConfigure(records);

// Fast path: in-memory pipeline (<10K records)
const result = await runPipeline(records, config);

// Scale path: DuckDB SQL pushdown (≥10K records)
const be = new NodeDuckDBBackend(':memory:');
const sqlResult = await runPipeline(records, config, { sqlBackend: be });
await be.close();
```

## Features

**Pipeline:**
- Fellegi-Sunter Expectation-Maximization with m/u probability estimation
- DuckDB SQL pushdown: blocking → comparison → scoring in C++ engine
- Inline prefix filter prevents O(N²) pair explosion on diverse datasets
- Automatic configuration detection from dataset field types

**Comparators (19 types):**
`exact` · `levenshtein` · `damerau_levenshtein` · `jaro` · `jaro_winkler` · `dice` · `jaccard` · `overlap` · `lcs` · `soundex` · `double_metaphone` · `token_sort` · `tfidf_cosine` · `qgram_tfidf` · `ensemble` · `numeric_diff` · `date_diff` · `boolean_match` · `radial`

**Scoring:**
- WASM Rust scorers (50M ops/s) via `strsimkit`
- Native JS fallback via `fastest-levenshtein`
- SQL-native via DuckDB UDFs

**Uniquely Browser-Capable:**
- DuckDB WASM embedded storage
- Web Worker pool for parallel scoring
- Privacy-Preserving Record Linkage (PPRL)
- MCP integration for AI-assisted matching

## Packages

| Package | Role |
|---------|------|
| `entity-resolver-core` | Pipeline, algorithms, types — zero I/O |
| `entity-resolver-node` | DuckDB Node + PostgreSQL backends |
| `entity-resolver-browser` | DuckDB WASM + Web Worker pool |
| `entity-resolver-studio` | Web UI for interactive ER |
| `entity-resolver-server` | REST API |
| `entity-resolver-cli` | Command-line interface |
| `entity-resolver-link` | Pairwise linkage |
| `entity-resolver-extract` | Feature extraction |
| `entity-resolver-visual` | Chart components |

## Architecture

```
entity-resolver-core (contracts only)
    ├── entity-resolver-node     (DuckDB Node · PostgreSQL)
    └── entity-resolver-browser  (DuckDB WASM · Web Workers)
            ├── entity-resolver-server
            ├── entity-resolver-studio
            └── entity-resolver-cli
```

## Benchmark

```bash
node benchmarks/run.mjs 500K     # synthetic benchmark
node benchmarks/leipzig.mjs       # DBLP-ACM, Amazon-Google
python3 benchmarks/staged_bench.py  # Splink comparison
```

| Dataset | Records | ER | Splink |
|---------|--------|:--:|:--:|
| DBLP-ACM | 4,910 | 3.5s | 3.8s |
| Synthetic 500K | 600,000 | 1.1s | 0.6s |
| Synthetic 1M | 1,200,000 | 2.2s | — |

## vs Splink

| | entity-resolver | Splink |
|---|---|:--:|
| Browser/WASM | ✅ | ❌ |
| PPRL | ✅ | ❌ |
| MCP | ✅ | ❌ |
| Comparison types | 19 | 19 |
| Visual diagnostics | ⏳ | ✅ |
| Backends | DuckDB + PG | 5 |

## License

MIT
