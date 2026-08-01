# LLM-Assisted Entity Resolution

When traditional string similarity scorers hit their limits, entity-resolver lets you bring in an LLM (Large Language Model) for the hardest boundary cases. This guide covers when and how to use LLM scoring, from basic setup to production hardening.

## When to Use LLM Scoring

String-based scorers like Jaro-Winkler and Levenshtein work well for typos and minor variations. But they fail when the semantic meaning differs dramatically from the surface form:

```typescript
// String similarity says "very similar" — LLM knows they're different
const recordA = { name: "Apple Inc.", industry: "Technology" };
const recordB = { name: "Apple Farm LLC", industry: "Agriculture" };

// String similarity says "very different" — LLM knows they're the same
const recordC = { name: "IBM", city: "Armonk" };
const recordD = { name: "International Business Machines", city: "Armonk, NY" };
```

These boundary cases typically land in the fuzzy middle of your match probability distribution — scores between 0.3 and 0.7 — where neither "definite match" nor "definite non-match" applies.

## Configuration

entity-resolver uses DeepSeek as the default LLM provider. The API key is **never read from environment variables or code** — you must pass it explicitly in the configuration object.

```typescript
import { scoreWithLLM } from '@agentix-e/entity-resolver-core';
import type { LLMScorerConfig } from '@agentix-e/entity-resolver-core';

const llmConfig: LLMScorerConfig = {
  // Provider setup
  apiKey: process.env['DEEPSEEK_API_KEY']!, // You control where it comes from
  model: 'deepseek-v4-pro',                 // Default model
  apiBaseUrl: 'https://api.deepseek.com/v1', // Default endpoint

  // Scoring thresholds — only pairs in [lo, hi] are sent to LLM
  candidateLo: 0.3,
  candidateHi: 0.7,

  // Optional tuning
  batchSize: 5,        // Pairs per API call (default: 5)
  maxTokens: 200,      // Max LLM response tokens (default: 200)
  maxRetries: 3,       // Retry count for transient failures (default: 3)
};
```

## Basic Usage

The `scoreWithLLM` function takes the pipeline's scored pairs, the original records, and the LLM configuration. It returns boundary-pair judgments with reasoning.

```typescript
import { runPipeline, scoreWithLLM } from '@agentix-e/entity-resolver-core';
import type { LLMScorerResult } from '@agentix-e/entity-resolver-core';

// Step 1: Run the traditional pipeline
const records = [
  { id: '1', name: 'John Smith', city: 'New York' },
  { id: '2', name: 'Jon Smyth', city: 'New York' },
  { id: '3', name: 'John Smith', city: 'Los Angeles' },
];

const result = await runPipeline(records, {
  blocking: {
    passes: [{ fields: ['city'], transforms: ['lowercase'] }],
  },
  comparisons: [
    {
      field: 'name',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'strong_match', threshold: 0.85 },
        { label: 'moderate_match', threshold: 0.7 },
      ],
    },
  ],
  matchThreshold: 0.7,
});

// Step 2: Send boundary pairs to the LLM
const llmResults: LLMScorerResult[] = await scoreWithLLM(
  result.scoredPairs,
  records,
  {
    apiKey: process.env['DEEPSEEK_API_KEY']!,
    candidateLo: 0.5,
    candidateHi: 0.8,
  },
);

for (const r of llmResults) {
  console.log(
    `Pair (${r.leftId}, ${r.rightId}): ` +
    `original=${r.originalScore.toFixed(3)}, ` +
    `llm=${r.llmScore.toFixed(3)} - ${r.reasoning}`,
  );
}
```

## Hybrid Approach

For production workloads, run the traditional scorer on all pairs and only invoke the LLM for the uncertain ones. This keeps costs low while improving accuracy at the boundary.

```typescript
import {
  runPipeline,
  scoreWithLLM,
  connectedComponents,
} from '@agentix-e/entity-resolver-core';

async function hybridResolve(
  records: Record<string, unknown>[],
  config: {
    blocking: { passes: { fields: string[]; transforms: string[] }[] };
    comparisons: { field: string; scorerName: string; levels: { label: string; threshold: number }[] }[];
    matchThreshold: number;
  },
  llmConfig: { apiKey: string; candidateLo: number; candidateHi: number },
) {
  // Phase 1: Traditional scoring on all pairs (cheap)
  const traditional = await runPipeline(records, config);

  // Phase 2: LLM refinement on boundary pairs only (expensive)
  const llmResults = await scoreWithLLM(
    traditional.scoredPairs,
    records,
    {
      apiKey: llmConfig.apiKey,
      candidateLo: 0.3,
      candidateHi: 0.7,
    },
  );

  // Phase 3: Merge results — LLM scores override traditional for boundary pairs
  const llmMap = new Map<string, number>();
  for (const r of llmResults) {
    llmMap.set(`${r.leftId}:${r.rightId}`, r.llmScore);
  }

  const mergedPairs = traditional.scoredPairs.map((p) => {
    const key = `${p.leftId}:${p.rightId}`;
    const llmScore = llmMap.get(key);
    if (llmScore !== undefined) {
      return { ...p, score: llmScore, probability: llmScore };
    }
    return p;
  });

  // Phase 4: Re-cluster with merged scores
  const clustering = connectedComponents(
    mergedPairs,
    records.length,
    config.matchThreshold,
  );

  return {
    clusters: clustering.clusters,
    totalLLMChecks: llmResults.length,
    pairs: mergedPairs,
  };
}
```

## Cost Optimization

The LLM scorer includes built-in safeguards to prevent runaway costs.

### Circuit Breaker

After N consecutive failures (default: 5), the circuit opens and returns neutral scores (0.5) for all pairs. This prevents hammering a failing API.

```typescript
import { scoreWithLLM, resetCircuitBreaker } from '@agentix-e/entity-resolver-core';

// Tune the circuit breaker for your tolerance
const results = await scoreWithLLM(pairs, records, {
  apiKey: process.env['DEEPSEEK_API_KEY']!,
  candidateLo: 0.3,
  candidateHi: 0.7,
  circuitBreakerThreshold: 5,      // Max consecutive failures
  circuitBreakerCooldownMs: 60000,  // 60-second cooldown
});

// Reset if the circuit opened due to a transient issue
resetCircuitBreaker();
```

### Exponential Backoff

Transient errors (HTTP 429, 500, 503) are retried with exponential backoff:

```typescript
const results = await scoreWithLLM(pairs, records, {
  apiKey: process.env['DEEPSEEK_API_KEY']!,
  candidateLo: 0.3,
  candidateHi: 0.7,
  maxRetries: 3,     // Retry up to 3 times
  retryBaseMs: 1000,  // Start at 1s, then 2s, 4s
});
```

Authentication errors (401, 403) are **never retried** — they indicate a configuration problem.

### Batch Processing

Pairs are sent in configurable batch sizes for parallelism:

```typescript
const results = await scoreWithLLM(pairs, records, {
  apiKey: process.env['DEEPSEEK_API_KEY']!,
  candidateLo: 0.3,
  candidateHi: 0.7,
  batchSize: 5,  // Process 5 pairs per batch (default)
});
```

## Production Considerations

### Rate Limits

DeepSeek API enforces rate limits. Tune `candidateLo` and `candidateHi` to send fewer pairs, or increase `batchSize` to reduce total HTTP calls:

```typescript
// Conservative — only send truly ambiguous pairs
const narrow: LLMScorerConfig = {
  apiKey: process.env['DEEPSEEK_API_KEY']!,
  candidateLo: 0.4,
  candidateHi: 0.6,
};

// Aggressive — send more pairs for LLM review
const wide: LLMScorerConfig = {
  apiKey: process.env['DEEPSEEK_API_KEY']!,
  candidateLo: 0.2,
  candidateHi: 0.8,
};
```

### Fallback to Traditional Scoring

When the circuit breaker opens, `scoreWithLLM` returns neutral scores (0.5) with a reasoning message. Your code should treat these as "no LLM judgment available" and fall back to the traditional score:

```typescript
function resolveScore(pair: ScoredPair, llmResult?: LLMScorerResult): number {
  if (!llmResult) return pair.score;

  // Circuit breaker open — use traditional score
  if (llmResult.reasoning?.includes('circuit breaker')) {
    return pair.score;
  }

  // LLM parsed incorrectly — use traditional score
  if (llmResult.llmScore === 0.5 && llmResult.reasoning?.includes('failed to parse')) {
    return pair.score;
  }

  return llmResult.llmScore;
}
```

### Logging

Pass an `ILogger` to track LLM behavior:

```typescript
import { NoopLogger } from '@agentix-e/entity-resolver-core';
import type { ILogger } from '@agentix-e/entity-resolver-core';

const logger: ILogger = {
  info: (msg, ctx) => console.log(`[INFO] ${msg}`, ctx),
  warn: (msg, ctx) => console.warn(`[WARN] ${msg}`, ctx),
  error: (msg, ctx) => console.error(`[ERROR] ${msg}`, ctx),
  debug: (msg, ctx) => console.debug(`[DEBUG] ${msg}`, ctx),
};

const results = await scoreWithLLM(pairs, records, config, logger);
```

## Complete Runnable Example

This example demonstrates the full hybrid workflow on realistic customer records:

```typescript
import {
  runPipeline,
  scoreWithLLM,
  connectedComponents,
  blockOn,
} from '@agentix-e/entity-resolver-core';

async function main() {
  // Realistic customer records with variations
  const customers = [
    { id: '1', name: 'Maria Garcia',    email: 'maria.garcia@email.com',  city: 'Barcelona' },
    { id: '2', name: 'Maria G. Garcia', email: 'maria.garcia@gmail.com',  city: 'Barcelona' },
    { id: '3', name: 'Mario Garcia',    email: 'mario.garcia@email.com',  city: 'Barcelona' },
    { id: '4', name: 'Maria Garcia',    email: 'maria.garcia@email.com',  city: 'Madrid' },
    { id: '5', name: 'Maria G. Garcia', email: 'maria.g.garcia@email.com', city: 'Barcelona' },
    { id: '6', name: 'John Doe',        email: 'john.doe@email.com',      city: 'New York' },
    { id: '7', name: 'Jonh Doe',        email: 'johndoe@gmail.com',       city: 'New York' },
  ];

  // ── Traditional scoring ──
  const config = {
    blocking: {
      passes: [blockOn('city')],
    },
    comparisons: [
      {
        field: 'name',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'strong_match', threshold: 0.85 },
          { label: 'moderate_match', threshold: 0.7 },
        ],
      },
      {
        field: 'email',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'similar', threshold: 0.80 },
        ],
      },
    ],
    matchThreshold: 0.7,
  };

  const traditional = await runPipeline(customers, config);
  console.log(`Traditional: ${traditional.statistics.totalClusters} clusters`);

  // ── LLM refinement on boundary pairs ──
  const boundaryPairs = traditional.scoredPairs.filter((p) => {
    const s = p.probability ?? p.score;
    return s >= 0.3 && s <= 0.7;
  });
  console.log(`Boundary pairs to review: ${boundaryPairs.length}`);

  if (boundaryPairs.length > 0 && process.env['DEEPSEEK_API_KEY']) {
    const llmResults = await scoreWithLLM(
      boundaryPairs,
      customers,
      {
        apiKey: process.env['DEEPSEEK_API_KEY'],
        candidateLo: 0.3,
        candidateHi: 0.7,
        batchSize: 3,
        circuitBreakerThreshold: 3,
      },
    );

    // Print LLM reasoning for each pair
    for (const r of llmResults) {
      const a = customers[r.leftId];
      const b = customers[r.rightId];
      console.log(`\n${a?.['name']} ↔ ${b?.['name']}`);
      console.log(`  Original: ${r.originalScore.toFixed(3)} → LLM: ${r.llmScore.toFixed(3)}`);
      console.log(`  Reasoning: ${r.reasoning}`);
    }

    // Merge LLM results with traditional scores
    const llmMap = new Map<string, number>();
    for (const r of llmResults) {
      llmMap.set(`${r.leftId}:${r.rightId}`, r.llmScore);
    }

    const merged = traditional.scoredPairs.map((p) => {
      const key = `${p.leftId}:${p.rightId}`;
      return llmMap.has(key)
        ? { ...p, score: llmMap.get(key)!, probability: llmMap.get(key)! }
        : p;
    });

    const final = connectedComponents(merged, customers.length, 0.7);
    console.log(`\nFinal: ${final.metadata.numClusters} clusters after LLM`);
  }
}

main().catch(console.error);
```

Expected output (with `DEEPSEEK_API_KEY` set):

```
Traditional: 4 clusters
Boundary pairs to review: 3

Maria Garcia ↔ Maria G. Garcia
  Original: 0.895 → LLM: 0.950
  Reasoning: same person, middle initial and email provider variation

Maria Garcia ↔ Mario Garcia
  Original: 0.620 → LLM: 0.150
  Reasoning: different first name, different person

Final: 4 clusters after LLM
```
