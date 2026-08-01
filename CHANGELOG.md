# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### O1-O5: Enterprise Hardening — 2026-07-25

#### O5: Error Hierarchy Completion
- Complete error hierarchy migration: all core throws now use typed errors from 14-class hierarchy
- Removed stale TODOs and dead code paths across all packages
- Fixed README code example for Quick Start

#### O4: Code Quality
- DRY parseCandidatePairs function across pipeline and link modules
- Added semantic accuracy validation tests for pipeline output
- Fixed scorer count reference inconsistencies in documentation

#### O3: Security Hardening
- Error hierarchy consistency checks across all packages
- Security headers on all API responses (Hono middleware)
- XSS prevention in Web Components (entity-resolver-visual)
- Rate limiting middleware with configurable window

#### O2: ONNX Integration
- ONNX NER adapter for client-side entity extraction
- Lunar/Dangi temporal parsing support for CJK calendars
- Calendar system auto-detection (Gregorian, Lunar, Japanese, Dangi)

#### O1: Production Bug Fixes
- Fixed blockCount semantic error (was reporting candidate pair count, not block count)
- Fixed reductionRatio parameter mismatch between interface and implementation
- Corrected P0 blocking threshold regression from refactoring

### I12-I19: Extract Pipeline — 2026-07-25

#### I18+I19: Integration Verification & Documentation
- Full integration test suite across all 10 packages
- EM pair sampling: capped training data at 2,000 pairs with deterministic hash-based sampling
- Pipeline candidate capping: max 150,000 pairs per pipeline run
- Performance: FEBRL 5000 benchmark reduced from 349s to 183s (1.9x faster)
- Verified zero regression on all 8 benchmark datasets

#### I17: CLI Extract Command
- CLI extract command for entity extraction from unstructured text
- Server REST and MCP extract endpoints with JSON-RPC 2.0 transport
- Zod schema validation for extraction output

#### I16: LLM Extraction
- LLM-based entity extraction using DeepSeek API (`deepseek-v4-pro`)
- Configurable circuit breaker with exponential backoff retry
- Multi-pair batch processing for cost efficiency

#### I15: Context-Aware Extraction
- Multi-turn slot inheritance for conversational extraction pipelines
- Context window management with sliding buffer
- Session state persistence across extraction rounds

#### I14: CJK Temporal Expression Parser
- Chinese/Japanese/Korean temporal expression parsing
- Lunar calendar to Gregorian conversion
- Relative date resolution (e.g., "next Monday", "last week")

#### I13: Pattern Extraction Core Engine
- 3-layer cascade architecture: pattern matching → ONNX NER → LLM
- 13 built-in semantic patterns (email, phone, name, date, etc.)
- Fallback chain with confidence scoring per extraction

#### I12: Extract & Link Package Scaffolding
- New packages: `@agentix-e/entity-resolver-extract`, `@agentix-e/entity-resolver-link`
- Package skeleton with typed DI interface contracts
- Zero-regression build and test integration into 10-package monorepo

### Recent Bugfixes — 2026-07-26 through 2026-08-01

#### CRITICAL Bug Fixes (7)
- **C1 (ARI)**: Fixed Adjusted Rand Index formula — use binomial coefficients C(n,2) instead of n² (commit `1c74f15`)
- **C2 (SQL Scorer Mapping)**: Correct SQL scorer-to-DuckDB function mapping — 8 scorers now correctly mapped (commit `0b927e5`)
- **C3 (SQL Clustering)**: Use Union-Find connected components in SQL pipeline clustering — transitive closure guaranteed (commit `5fa98fa`)
- **C4 (Gomory-Hu Tree)**: Implemented correct Gomory-Hu tree algorithm (Gusfield 1990) in Cut Clustering (commit `2d49711`)
- **C5 (PPRL Hashing)**: Fixed SHA-256 cross-platform hashing — Node.js `crypto.createHash` + Web Crypto `subtle.digest` paths (commit `5d8e44d`)
- **C6 (EM Level Ordering)**: Custom comparison level names now correctly ordered via PAVA isotonic regression (commit `6b0df69` enhancement)
- **C7 (Key Parsing)**: Fixed EM key parsing to support field names containing colons via `lastIndexOf(':')` (commit `6b0df69`)

#### HIGH Severity Fixes (5)
- **H1**: EM wildcard keys (`field:*`) now correctly updated with aggregated m/u probabilities (commit `d36cd9b`)
- **H2**: `computeMatchWeight` and `computeAggregateMatchWeight` now produce identical results (commit `0f043cb`)
- **H3**: SQL EM training no longer claims "data stays in database" when it loads all data to JS (commit `0f043cb`)
- **H4**: `computeTFAdjustment` recalibrated — no longer over-penalizes common values (commit `4334ba8`)
- **H5**: `qgramTfIdfScorer` correctly documented as pure Jaccard — misleading TF-IDF label removed (commit `4334ba8`)

#### MEDIUM Severity Fixes (7)
- **M1**: `computeMetaphone` documented as simplified approximation, not full Metaphone
- **M2**: `tokenBlocking` now logs oversized blocks (>1000) instead of silently discarding records
- **M3**: `numericDiffScorer` uses absolute threshold for normalization, not relative
- **M4**: SQL `tokenSort`/`jaccard` implemented as true token-level comparison
- **M5**: `buildFastSingleQuery` no longer hardcodes default m/u weights — uses EM training results
- **M6**: Score normalization now clamps to [0, 1] — boundary overflow prevented
- **M7**: `computeCramersV` dead code (duplicate `colTotals` computation) removed

---

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
