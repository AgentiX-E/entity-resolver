# Comprehensive Competitive Analysis — @agentix-e/entity-resolver

**Date**: 2026-07-26  
**Analyzed**: Full source code audit (255 files, 8 packages) + Web research on all major competitors  
**Commit**: c64e8ea (master, 2026-07-26)

---

## Honest Answer: Three Critical Questions

### Q1: Is the current design and implementation truly enterprise/industrial grade?

**No. Approximately 65-70% of the way there.** The architecture is sound, the TypeScript discipline is strong, and the algorithm portfolio is impressive. But **CI is currently failing on master** (see Section: Critical Issues), the build script violates stated policies, benchmarks use synthetic data, and several production-hardening gaps exist.

### Q2: Does it combine advantages of ALL reference projects and comprehensively surpass them?

**No. It has unique advantages Splink/dedupe/etc. don't have, but it also LACKS critical capabilities those projects ship.** See detailed comparison below.

### Q3: Is it superior to ALL competitors in algorithm depth, breadth, precision, accuracy, and engineering maturity, becoming the industry benchmark?

**No. It excels in breadth but lags in depth and maturity.** Specifically: Splink has production validation with real datasets and the UK Government; entity-resolver uses synthetic datasets. GoldenMatch (another TypeScript ER library) has Rust/WASM with cross-language parity gates, something entity-resolver hasn't attempted.

---

## Competitive Landscape: Full Comparison

### Tier 1: Direct Competitors

| Dimension | entity-resolver | Splink (Python) | GoldenMatch (TS/Python) | dedupe (Python) | Zingg (Scala/Spark) |
|---|---|---|---|---|---|
| **Language** | TypeScript | Python | TS + Python + Rust | Python | Scala/Spark |
| **Stars** | 1 | 1,900+ | Unknown | 4,400+ | 1,300+ |
| **License** | MIT | MIT | Unknown | MIT | AGPL-3.0 |
| **Production use** | 0 | UK Gov (4y) | Unknown | SaaS | Enterprise |
| **FS model** | ✅ | ✅ | ✅ | ❌ (ML) | ❌ (ML) |
| **EM estimation** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **WASM acceleration** | ✅ (~5x) | ❌ | ✅ (Rust kernel) | ❌ | ❌ (JVM) |
| **Browser support** | ✅ (DuckDB WASM) | ❌ | ✅ | ❌ | ❌ |
| **MCP protocol** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **PPRL** | ✅ (Bloom) | ❌ | ✅ | ❌ | ❌ |
| **LLM scorer** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Active learning** | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Golden records** | ✅ (13 strategies) | ❌ | ❌ | ❌ | Enterprise only |
| **Graph metrics** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Incremental updates** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Visual diagnostics** | ✅ (Web Components) | ✅ (Altair charts) | Unknown | ❌ | ❌ |
| **SQL backends** | DuckDB + PG | DuckDB + Spark + PG + Athena + SQLite | PG + DuckDB | ❌ | Spark |
| **Real dataset valid.** | ❌ (synthetic) | ✅ (real) | Unknown | ✅ | ✅ |
| **CI passing** | ❌ (failing) | ✅ | Unknown | ✅ (inactive) | ✅ |
| **Scalability (records)** | 5K (tested) | 100M+ | 100M (claimed) | 100K | 100M+ |
| **# comparison funcs** | 19 scorers | 5+ (SQL-UDF) | Unknown | 10+ | ML-based |
| **# blocking strats** | 5 + 3 builders + 7 weighting + 8 pruning | SQL block_on | Unknown | 3+ | Spark-based |
| **# clustering algos** | 12 (3 + 9 pyJedAI) | 1 (connected comp.) | Unknown | 1 | 1 |
| **# evaluation metrics** | 12 | 4+ | Unknown | 8 | 4+ |

### Key Takeaways

1. **entity-resolver has the BROADEST algorithm coverage** — 12 clustering, 33 blocking-related, 19 scorers, 12 evaluation metrics. No competitor matches this breadth.
2. **Splink has the DEEPEST production validation** — 4 years UK Government, real datasets, awards. entity-resolver has zero real-world usage.
3. **GoldenMatch is the most DANGEROUS competitor** — TypeScript + Python + Rust/WASM parity gates, similar feature set. entity-resolver must monitor this closely.
4. **entity-resolver's unique moat**: Only TypeScript ER library combining FS probabilistic model + WASM + Browser + PPRL + LLM + MCP + Golden Records.

---

## Critical Issues Found

### 🔴 P0 — CI FAILING ON MASTER

**Latest CI run**: `failure` — all job types failing on commit `c64e8ea`

```
CI:              failure (completed)
Benchmark Regr.: failure (completed)
Deploy Docs:     failure (completed)
```

This directly violates CONTRIBUTING.md: "Every PR and push to master must pass ALL checks. No continue-on-error or || true workarounds are tolerated."

### 🔴 P0 — Build script contains `|| true`

```json
// packages/entity-resolver-core/package.json
"build": "tsc -p tsconfig.json && cp -r src/matching/scorers/wasm/scorers dist/... 2>/dev/null; cp -r src/benchmarks/data dist/... 2>/dev/null; true"
```

The trailing `true` is effectively `|| true` — makes build always pass regardless of copy failures. This directly violates the stated policy of "no || true workarounds".

### 🟠 P1 — All benchmarks use SYNTHETIC data

```
FEBRL 5000:        Deterministric FEBRL-style generator (not real FEBRL)
DBLP-ACM:          Generated fallback (not real DBLP-ACM)
Abt-Buy:           Generated cross-retailer
Amazon-Google:     Generated with description variations
WDC Products/Offers: Generated corpora
iTunes-Amazon:     Generated with format variations
Cora:              Generated with venue abbreviations
```

The QUALITY_AUDIT_REPORT (2026-07-24) itself noted: "Benchmarks use synthetic generators, not true DBLP-ACM/Abt-Buy datasets." Splink tests against **real** DBLP-ACM, FEBRL, and Census data.

### 🟠 P1 — No npm publish has ever succeeded

```
version: 0.0.0
npm publish: Not triggered (no v*.*.* tags exist)
```

The npm-publish CI workflow exists but has never been triggered. No package on npmjs.com under `@agentix-e/entity-resolver-core`.

### 🟠 P1 — Scalability not validated beyond 5K records

Largest tested dataset: 4,910 records (DBLP-ACM generated). Splink handles 1M on laptop, 100M+ on Spark. entity-resolver has never been validated against datasets of meaningful production size.

### 🟡 P2 — Property-based testing virtually unused

`fast-check` is in devDependencies but only used in 1 test file (scorers.test.ts) out of 60+ test files.

### 🟡 P2 — Cross-validation: only k-fold, no stratified

Has basic k-fold cross-validation but missing stratified k-fold for imbalanced data, time-series cross-validation, and holdout validation with confidence intervals.

### 🟡 P2 — No benchmark against Splink's standard datasets

Never directly compared F1 scores against Splink on identical datasets. The "Splink-compatible comparison system" claim is true architecturally but never validated numerically.

### 🟡 P2 — Core branch coverage at 89.77% (target: 95%)

Advertised target is ≥95% statements AND branches. Current core branches: 89.77%. The i24 commit explicitly targets "89.77% → 95%" but hasn't achieved it yet.

---

## Strengths: Where entity-resolver EXCELS

### 1. Architecture Design (8.5/10)
- Stateless pure-computation core: `f(records) → {clusters, scores, diagnostics}` — elegant
- DI interface contracts properly separated core from IO implementations
- `core` package truly has zero IO — rare and correctly executed
- Interface hierarchy: IDataSource, IEntityStore, IConfigStore, IScore, ISqlBackend, ILogger

### 2. TypeScript Discipline (9/10)
- Strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- Zero `@ts-ignore` or `@ts-nocheck` across core
- `readonly` on all public interface fields
- Proper `import type` usage throughout
- ESLint strict config with test file exceptions

### 3. Algorithm Portfolio (9.5/10 breadth)
- **Fellegi-Sunter**: Full EM with multi-start, PAVA level ordering, Splink-style hash sampling
- **19 scorers**: exact through radial (Haversine)
- **5 blocking strats**: Standard, Token, Sorted Neighborhood, Multi-pass, Meta-blocking
- **3 blocking builders**: SuffixArrays, ExtendedSuffixArrays, ExtendedQGrams (pyJedAI)
- **7 weighting schemes**: CBS, JACCARD, COSINE, DICE, ECBS, EJS, X²
- **8 pruning methods**: WEP, CEP, CNP, RCNP, WNP, BLAST, RWNP, CP
- **12 clustering**: 3 core + 9 pyJedAI (Center, BestMatch, MergeCenter, Correlation, Cut, Markov, KiralyMSM, RicochetSR, RowColumn)
- **12 evaluation metrics**: pairwise, cluster, B-cubed, ARI, FMI, V-measure, homogeneity, completeness

### 4. Error Handling (8/10)
- 14-class typed error hierarchy with error codes
- JSON reconstruction for MCP transport
- `wrapError` for unknown error conversion
- Zero silent error swallowing pattern

### 5. Unique Capabilities (no competitor has ALL of these)
- **PPRL** with Bloom filters + both sync/async path + cross-platform crypto
- **LLM scorer** with circuit breaker, exponential backoff, batch processing, graceful degradation
- **MCP JSON-RPC 2.0** protocol with SSE transport (AI agent integration)
- **Golden Record survivorship** with 13 strategies (longest, most_popular, most_complete, source_priority, first, concatenate, avg, min, max, sum, median, most_recent, oldest)
- **W3C Trace Context** propagation for distributed tracing
- **3-layer visualization**: Data API (pure JSON) → Headless (state machines) → Web Components (20+ CSS custom properties)

---

## What Splink Has That entity-resolver DOESN'T

### 1. Separate u-probability estimation via random sampling
Splink estimates u-probabilities independently using random record pairing, then trains EM only for m-probabilities. entity-resolver estimates both simultaneously in EM, which can be less accurate when non-match pairs dominate.

### 2. Built-in model saving/loading
Splink's `save_model_to_json()` / `load_model_from_json()` enables trained model persistence without re-training. entity-resolver has model serialization but it's not integrated into the pipeline workflow as a first-class feature.

### 3. Real-time matching against existing model
Splink's `find_matches_to_new_records()` allows matching new records against a trained model without re-training. entity-resolver's `gazetteerMatch` exists but isn't as polished.

### 4. Data profiling tools
Splink's `completeness_chart()`, `profile_columns()`, `count_comparisons_from_blocking_rule()` provide data understanding before modeling. entity-resolver has `autoConfigure` but lacks interactive profiling.

### 5. Cumulative comparison chart from blocking rules
Splink's `cumulative_comparisons_to_be_scored_from_blocking_rules_chart()` helps users design efficient blocking strategies. entity-resolver has `analyzeBlockingRule` but no cumulative visualization.

### 6. Production validation with real data
Splink processes real UK Government datasets (Ministry of Justice, NHS). entity-resolver has NEVER been validated against real production data.

---

## What GoldenMatch Has That entity-resolver DOESN'T

### 1. Cross-language parity gates
GoldenMatch has Rust/WASM kernel shared between Python and TypeScript, with CI-enforced parity YAML fixtures. Adding a feature in one language fails CI if the other doesn't match.

### 2. Multiple language SDKs
Python + TypeScript + Rust + SQL-native (Postgres + DuckDB). entity-resolver is TypeScript-only.

### 3. dbt + Airflow integration
GoldenMatch fits into existing data engineering pipelines. entity-resolver has no dbt or Airflow integration.

### 11. Documentation maturity
GoldenMatch has agent codemaps (committed AST index for AI agents), decision records, and parity conformance YAML. entity-resolver's docs are thinner.

---

## Scorecard: Enterprise Readiness Matrix

| Dimension | Score | Industry Target | Gap |
|---|---|---|---|
| Architecture design | 8.5/10 | 9/10 | DI scope could expand |
| TypeScript strictness | 9/10 | 9/10 | ✅ |
| Error handling | 8/10 | 9/10 | Missing structured logging in core |
| Algorithm breadth | 9.5/10 | 8/10 | ✅ (exceeds target) |
| Algorithm depth (per algo) | 7/10 | 9/10 | EM, active learning need deepening |
| Test coverage (core) | 8/10 | 9/10 | Branches: 89.77% vs target 95% |
| CI/CD maturity | 5/10 | 9/10 | **CI FAILING, build script has || true** |
| Real dataset validation | 3/10 | 9/10 | All synthetic, no real FEBRL/DBLP-ACM |
| Scalability proof | 3/10 | 8/10 | Max tested: 5K records |
| Documentation | 6/10 | 8/10 | API docs incomplete, migration guide missing |
| Security | 7/10 | 9/10 | No OWASP audit, no dependency vuln scanning |
| npm distribution | 0/10 | 9/10 | Never published |
| Production validation | 0/10 | 9/10 | Zero real-world usage |
| **Overall** | **~65%** | **95%** | **Significant gaps** |

---

## Competitive Position Summary

```
        algorithm breadth
              ↑
      10 ─    │    ★ entity-resolver
       9 ─    │
       8 ─    │              ★ Splink
       7 ─    │
       6 ─    │                              ★ GoldenMatch
       5 ─    │
       4 ─    │    ★ dedupe         ★ Zingg
       3 ─    │
       2 ─    │
       1 ─    │
       0 ─────┼──────────────────────────────────→ production maturity
              0   2   4   6   8   10
```

entity-resolver: **Highest breadth, lowest maturity**
Splink: **Highest maturity, strong breadth**
GoldenMatch: **Emerging threat with Rust/WASM edge**

---

## Verdict

**entity-resolver has a UNIQUE and DEFENSIBLE market position**: the only TypeScript-first, browser-runnable, WASM-accelerated general-purpose entity resolution library with Fellegi-Sunter probabilistic model, PPRL, and MCP integration.

**However, it is NOT enterprise-grade today.** The CI failures on master, synthetic-only benchmarks, unvalidated scalability, and missing npm distribution are blocking enterprise adoption.

**It does NOT comprehensively surpass all reference projects.** Splink exceeds it in production validation, SQL backend diversity, real dataset benchmarks, and model persistence. GoldenMatch threatens it with cross-language parity and Rust/WASM depth.

**It is NOT the industry benchmark** — that title belongs to Splink (Python ecosystem) and Senzing (commercial). entity-resolver CAN become the TypeScript/JavaScript ecosystem benchmark, but has critical work ahead.

---

## Proposed Path to Enterprise Grade

### I12: CI & Build Quality (P0)
- Fix CI failures on master
- Remove `|| true` from build scripts
- Add Codecov threshold enforcement
- Add dependency vulnerability scanning (npm audit CI)

### I13: Real Dataset Validation (P0)
- Integrate real FEBRL, DBLP-ACM, Abt-Buy datasets
- Benchmark against Splink on identical data
- Publish comparative accuracy report

### I14: Scalability (P1)
- Load testing: 100K, 1M, 10M records
- O(N²) performance profiling
- Memory optimization for large datasets
- Confirm pipeline.candidates cap works at scale

### I15: npm Distribution (P1)
- Tag first release v0.1.0
- Verify npm-publish workflow succeeds
- Publish all 8 packages with sigstore provenance

### I16: Splink Feature Parity (P1)
- Separate u-probability estimation via random sampling
- Model save/load integrated into pipeline
- Cumulative blocking comparison chart
- Data profiling tools (completeness, column profiles)

### I17: Algorithm Depth (P1)
- Stratified k-fold cross-validation
- Confidence intervals for all metrics
- Core branch coverage to 95%
- Property-based testing coverage expansion

### I18: Documentation & DX (P2)
- Complete API reference docs
- Migration guide from Splink/dedupe
- Real-world case studies
- Interactive playground

I12 and I13 are the absolute minimum for enterprise credibility.
