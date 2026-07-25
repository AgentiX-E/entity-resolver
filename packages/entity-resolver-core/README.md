# @agentix-e/entity-resolver-core

**Stateless Entity Resolution Engine with WASM Acceleration**

Pure computation. Zero I/O. Runs anywhere JavaScript runs.

```typescript
import { dedupe } from '@agentix-e/entity-resolver-core';

const result = await dedupe(records);
// { clusters, scoredPairs, statistics, diagnostics }
```

## Features

- **Fellegi-Sunter** probabilistic model with EM parameter estimation
- **19 scorers** — exact, levenshtein, jaro_winkler, dice, soundex, +14 more
- **12 clustering algorithms** — Connected Components, DBSCAN, 9 pyJedAI algorithms
- **8 blocking strategies** — Standard, Token, Sorted Neighborhood, Meta-blocking
- **WASM acceleration** — ~5x faster for string scorers (auto-fallback to pure JS)
- **PPRL** — Privacy-preserving linkage with Bloom filters
- **Active Learning** — Uncertainty sampling + logistic classifier
- **Golden Record** survivorship — longest, most_popular, source_priority
- **LLM scorer** — DeepSeek/OpenAI boundary-pair resolution
- **14-class typed error hierarchy** — programmatic error discrimination

## Architecture

```
f(records) → { clusters, matchPairs, scores, diagnostics }
```

This package defines **only interfaces** — no I/O, no side effects. All persistence is via DI contracts (IDataSource, IEntityStore, IConfigStore, IScorer, ISqlBackend) implemented in platform packages.

## API (see full docs)

```typescript
import {
  runPipeline, runPipelineFromSource,
  autoConfigure, dedupe, linkRecords, gazetteerMatch,
  sqlBlocking, sqlEstimateParameters,
  buildGoldenRecord,
  scoreWithLLM, encodePPRL,
  evaluateClustering,
} from '@agentix-e/entity-resolver-core';
```

## Dependencies

Zero runtime dependencies. Pure TypeScript + compiled WASM (optional dependency).

## License

MIT © Lambertyan
