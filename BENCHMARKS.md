# Entity Resolution Benchmarks

## Pipeline Performance

All 8 datasets processed in **2,832ms** (single machine, Node.js 22, pure JS scoring).

| Dataset | Records | Duration |
|---------|---------|----------|
| FEBRL 5000 | 1,267 | 1,884ms |
| DBLP-ACM | 1,000 | 899ms |
| Abt-Buy | 400 | 8ms |
| Amazon-Google | 400 | 6ms |
| WDC Products | 600 | 11ms |
| WDC Offers | 800 | 15ms |
| iTunes-Amazon | 200 | 4ms |
| Cora | 300 | 5ms |

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
| entity-resolution-core | 344 | 94.4% | 87.7% | 94.2% | 94.4% |
| entity-resolution-node | 28 | 83.3% | 78.3% | 83.3% | 83.3% |
| entity-resolution-browser | 8 | 37.4% | 52.2% | 58.8% | 37.4% |
| entity-resolution-visual | 36 | 94.8% | 88.1% | 94.3% | 94.8% |
| entity-resolution-server | 6 | — | — | — | — |
| entity-resolution-cli | 17 | 100% | 92% | 90% | 100% |
