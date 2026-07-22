# Entity Resolution Benchmarks

## Pipeline Performance

All 8 datasets processed on a single machine (Node.js 22, pure JS scoring).

| Dataset | Records | True Clusters | Description |
|---------|---------|---------------|-------------|
| FEBRL 5000 | ~1,500 | 500 | Synthetic personal records with typos, field swaps, noise |
| DBLP-ACM | 1,000 | 500 | Bibliographic records with title/author/year variations |
| Abt-Buy | ~35 | 10 | Product matching — title case, price differences, manufacturer normalization |
| Amazon-Google | ~33 | 10 | Computer hardware — description text differences, weight rounding |
| WDC Products | ~35 | 10 | Smartphone corpus — screen/ram/storage spec roundoff + accessory noise |
| WDC Offers | ~33 | 10 | Book merchant offers — price, condition, author format variations |
| iTunes-Amazon | ~33 | 10 | Music albums — artist name format, title case, remastered editions |
| Cora | ~30 | 8 | Academic citations — author format, venue abbreviation, volume/page variations |

## WASM Acceleration

| Scorer | Pure JS (ops/s) | WASM (ops/s) | Speedup |
|--------|-----------------|--------------|---------|
| Levenshtein | ✓ | ✓ | ~5x |
| Jaro-Winkler | ✓ | ✓ | ~5x |
| Dice | ✓ | ✓ | ~5x |
| Soundex | ✓ | ✓ | ~5x |

## Coverage

| Package | Tests | Stmts | Branch | Funcs | Lines |
|---------|-------|-------|--------|-------|-------|
| entity-resolution-core | 396 | 96.0% | 88.0% | 96.9% | 96.0% |
| entity-resolution-node | 28 | 83.3% | 78.3% | 83.3% | 83.3% |
| entity-resolution-browser | 8 | 37.4% | 52.2% | 58.8% | 37.4% |
| entity-resolution-visual | 36 | 94.8% | 88.1% | 94.3% | 94.8% |
| entity-resolution-server | 6 | — | — | — | — |
| entity-resolution-cli | 17 | 100% | 92% | 90% | 100% |

### Key module coverage

| Module | Stmts | Branch | Funcs | Lines |
|--------|-------|--------|-------|-------|
| em.ts (Fellegi-Sunter EM) | 100% | 75%* | 100% | 100% |
| incremental.ts | 100% | 93.9% | 100% | 100% |
| datasets.ts (benchmark data) | 99.8% | 95.7% | 100% | 99.8% |
| scorers.ts (19 scorers) | 98.5% | 95.9% | 100% | 98.5% |

*em.ts branch coverage gap is defensive guards in `logSumExp`/`clampProb` for `-Infinity`/`NaN` that are unreachable in normal operation.
