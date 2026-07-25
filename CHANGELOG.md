# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### I11: Benchmark Fixes — 2026-07-25

#### Fixed
- **P0-3**: 5/8 benchmark datasets (DBLP-ACM, Amazon-Google, WDC Offers, iTunes-Amazon, Cora) now pass F1 ≥ 0.7
- Benchmark runner now uses auto-configure for intelligent field detection and blocking rule generation
- Small datasets (<500 records) automatically fall back to per-field blocking when initial blocking produces too few candidate pairs
- DBLP-ACM benchmark now runs `linkRecords` for cross-dataset record linkage (not dedupe)

#### Added
- `BenchmarkDataset.type` field: `'deduplication' | 'record_linkage'`
- `BenchmarkDataset.leftIndices` / `rightIndices` for record_linkage datasets
- `autoConfigure` integration into benchmark runner for automatic field semantic detection

#### Results
| Dataset | Before F1 | After F1 | Δ |
|---------|:---:|:---:|:---:|
| FEBRL 5000 | 0.804 | **0.999** | +0.195 |
| DBLP-ACM | 0.000 | **0.949** | +0.949 |
| Abt-Buy | 0.835 | **0.941** | +0.106 |
| Amazon-Google | 0.000 | **0.750** | +0.750 |
| WDC Products | 0.848 | **0.865** | +0.017 |
| WDC Offers | 0.000 | **0.811** | +0.811 |
| iTunes-Amazon | 0.000 | **0.965** | +0.965 |
| Cora | 0.000 | **0.965** | +0.965 |

### I10: Production Quality Baseline — 2026-07-25

#### Fixed
- **P0-1**: Benchmark regression CI workflow now references correct branch (`master`, not `main`)
- **P0-2**: Removed all `require()` calls from ESM source files; migrated to `createRequire` (standard ESM mechanism) in `pg-store.ts` and `datasets.ts`
- **P1-1**: CLI auto-detection now uses robust `import.meta.url` + string-includes matching instead of fragile `endsWith()` pattern
- Fixed 16 pre-existing TypeScript errors in test files (wrong argument counts, missing properties, unused variables)
- Fixed ESLint configuration: `typescript-eslint` was missing from devDependencies, causing lint to silently fail
- Upgraded DeepSeek default model from deprecated `deepseek-chat` to `deepseek-v4-pro`
- Fixed `exactOptionalPropertyTypes` violations in `formatError` function (rest/app.ts)
- Added graceful shutdown guard middleware and request tracking middleware
- Fixed `ZodSchema` deprecation warnings

#### Added
- Comprehensive LLM scorer mock tests (21 tests): boundary range logic, successful responses, error handling, multi-pair batching, markdown parsing, score clamping, malformed JSON handling
- Real integration tests for LLM scorer (3 tests, requires `DEEPSEEK_API_KEY` env var, auto-skipped otherwise)
- ESLint rules for test files (relaxed `no-explicit-any`, `no-unsafe-*`, `require-await`, `unbound-method`)
- Proper `.npmrc` and `.prettierrc` validation

#### Changed
- `MemoryEntityStore` and `MemoryConfigStore`: disabled `require-await` ESLint rule (sync Map operations implementing async interface)
- ESLint configuration updated for practical strictness with test file exceptions
- Graceful shutdown uses proper HTTP 503 responses instead of unhandled JSON

### I0–I9: Foundation through Production Readiness

#### I9: Documentation + LLM Scorer — 2026-07-24
- Quality audit report
- LLM scorer production config with DeepSeek API
- llms.txt for AI agent consumption

#### I8: Production Readiness — 2026-07-24
- MCP JSON-RPC 2.0 protocol implementation
- SSE transport for MCP
- Graceful shutdown infrastructure
- Accessibility improvements (WCAG)

#### I7: Splink Feature Parity — 2026-07-24
- EM sampling with max_pairs
- Graph metrics for clusters
- Composable blocking (AND/OR/intersect/union/subtract)

#### I6: pyJedAI Clustering Port — 2026-07-24
- 9 pyJedAI clustering algorithms: Center, BestMatch, MergeCenter, Correlation, Cut, Markov, KiralyMSM, RicochetSR, RowColumn

#### I5: pyJedAI Meta-blocking Port — 2026-07-24
- 3 blocking builders: SuffixArrays, ExtendedSuffixArrays, ExtendedQGrams
- 7 weighting schemes: CBS, JACCARD, COSINE, DICE, ECBS, EJS, X²
- 8 pruning methods: WEP, CEP, CNP, RCNP, WNP, BLAST, RWNP, CP

#### I4: CI/CD Industrialization — 2026-07-24
- Multi-platform CI matrix (Ubuntu + Windows + macOS, Node 20 + 22)
- Coverage thresholds enforced
- Benchmark regression detection workflow

#### I3: Memory Optimization — 2026-07-24
- Lazy preprocessing with in-place mutation option
- IDataSource interface for streaming data sources
- Adaptive binning for match weight histograms

#### I2: Core Algorithm Fixes — 2026-07-24
- Isotonic regression (PAVA) for EM level ordering constraints
- Disjoint Set Union (DSU) for connected components
- DBSCAN with adaptive epsilon
- Multi-start EM parameter estimation

#### I1: Error Handling Infrastructure — 2026-07-24
- 14-class typed error hierarchy (EntityResolverError base)
- Zero silent error swallowing
- Structured error codes for MCP/REST
- JSON serialization/deserialization for transport

#### I0: Security Hardening — 2026-07-24
- XSS prevention in web components
- Timing-safe authentication
- Trusted proxy support
- Security headers on all API responses
