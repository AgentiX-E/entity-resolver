# FAQ / Troubleshooting

Common issues and solutions for `@agentix-e/entity-resolver`.

## 1. "No matches found" — My pipeline returns zero matches

**Symptoms:** `result.clusters.size` equals the number of input records. `result.scoredPairs` is empty or all pairs score below threshold.

**Root causes and fixes:**

**A) Blocking rules are too strict.** If your blocking passes exclude all true duplicates, no pairs are generated to compare.

```typescript
// Before: overly strict blocking
const config = {
  blocking: {
    passes: [{ fields: ['email', 'phone_number'], transforms: ['exact'] }],
  },
};

// After: looser blocking with multiple passes
const config = {
  blocking: {
    passes: [
      { fields: ['email'], transforms: ['lowercase', 'strip'] },
      { fields: ['last_name', 'first_name'], transforms: ['lowercase'] },
      { fields: ['zipcode'], transforms: ['strip'] },
    ],
  },
};
```

**B) Threshold is too high.** Lower from 0.5 to 0.3 and inspect the waterfall chart.

```typescript
const result = await runPipeline(records, {
  ...config,
  matchThreshold: 0.3, // Lower from default 0.5
});
```

**C) Debug with blocking analysis:**

```typescript
import { analyzeBlockingRule } from '@agentix-e/entity-resolver-core';

const analysis = analyzeBlockingRule(records, config.blocking);
console.log(`Generated ${analysis.totalPairs} candidate pairs`);
console.log(`Reduction ratio: ${analysis.reductionRatio}`);
// If totalPairs is 0, blocking is too restrictive
```

## 2. "Too many false positives" — Unrelated records are being matched

**Symptoms:** Precision is low. Many scored pairs above threshold are not true duplicates.

**Fixes:**

**A) Raise the threshold:**

```typescript
// From 0.5 to 0.8 for stricter matching
const result = await runPipeline(records, {
  ...config,
  matchThreshold: 0.8,
});
```

**B) Add more blocking fields to reduce the comparison space:**

```typescript
const config = {
  blocking: {
    passes: [
      { fields: ['email'], transforms: ['lowercase'] },
      { fields: ['last_name', 'zipcode'], transforms: ['lowercase'] }, // added zipcode
    ],
  },
};
```

**C) Add strong exact-match comparisons as gatekeepers:**

```typescript
const config = {
  comparisons: [
    { field: 'email', scorerName: 'exact', weight: 0.4 },         // strong signal
    { field: 'phone', scorerName: 'exact', weight: 0.3 },         // strong signal
    { field: 'first_name', scorerName: 'jaro_winkler', weight: 0.15 },
    { field: 'last_name', scorerName: 'jaro_winkler', weight: 0.15 },
  ],
};
```

## 3. "Out of memory" — Pipeline crashes with OOM error

**Symptoms:** Process exits with `malloc failed`, `JavaScript heap out of memory`, or container OOMKilled.

**Fix: Switch from in-memory to DuckDB SQL pushdown.**

```typescript
import { runPipeline } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

// BEFORE: in-memory pipeline — OOM on large datasets
// const result = await runPipeline(records, config);

// AFTER: DuckDB SQL pushdown — handles 1M+ records
const backend = new NodeDuckDBBackend(':memory:');
const result = await runPipeline(records, config, { sqlBackend: backend });
await backend.close();
```

**Additional mitigations:**
- Reduce `maxPairs` in EM estimation: `{ maxPairs: 50000 }`
- Increase Node.js heap: `node --max-old-space-size=4096`
- Use Docker memory limits with headroom: `--memory="1g"`

## 4. "Slow performance" — Pipeline takes too long

**Symptoms:** Processing > 10 seconds for datasets under 100K records.

**Diagnostic checklist:**

```typescript
import { runPipeline } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

// Check if DuckDB is being used
const backend = new NodeDuckDBBackend(':memory:');
const start = performance.now();
const result = await runPipeline(records, config, { sqlBackend: backend });
console.log(`Time: ${(performance.now() - start).toFixed(0)}ms`);
await backend.close();
```

**Performance tips:**
- Use `standardBlocking` instead of `tokenBlocking` for structured data
- Limit multi-pass blocking to 2-3 passes (not 5+)
- Use prefix filter for diverse datasets (enabled by default in SQL mode)
- Pre-filter records before the pipeline (remove exact duplicates, empty rows)
- Use the simplest scorers for your data (`exact` > `jaro_winkler` > `levenshtein` > `tfidf_cosine`)

## 5. "DuckDB errors" — SQL execution fails

**Symptoms:** `DuckDBError: Catalog Error`, `Binder Error`, or `version mismatch`.

**Version requirement:** DuckDB >= 1.0.0 is required:

```bash
npm ls duckdb
# @agentix-e/entity-resolver-node
# └── duckdb@1.4.4  ✓

# If you see duckdb@0.x, upgrade:
npm install duckdb@latest
```

**Function availability errors:** Some SQL operations require UDF support. Ensure the scorer is registered:

```typescript
import { initScorers, getScorer } from '@agentix-e/entity-resolver-core';

await initScorers();
const scorer = getScorer('jaro_winkler');
if (!scorer) {
  throw new Error('Scorer not registered — run initScorers() first');
}
```

## 6. "WASM not loading in browser" — WASM module fails to initialize

**Symptoms:** Console error: `Failed to fetch WASM module`, `WebAssembly.instantiateStreaming failed`.

**Fix: CORS configuration.** WASM files must be served with correct MIME type and CORS headers.

```nginx
# nginx.conf — WASM serving configuration
location /wasm/ {
    types {
        application/wasm wasm;
    }
    add_header Cross-Origin-Resource-Policy cross-origin;
    add_header Cross-Origin-Opener-Policy same-origin;
    add_header Cross-Origin-Embedder-Policy require-corp;
}
```

**CDN fallback URLs:**

```typescript
import { tryLoadWasmScorers } from '@agentix-e/entity-resolver-core';

// Use a CDN fallback if the primary URL fails
await tryLoadWasmScorers({
  primaryUrl: '/wasm/scorers.wasm',
  fallbackUrls: [
    'https://cdn.jsdelivr.net/npm/@agentix-e/entity-resolver-core@latest/wasm/scorers.wasm',
    'https://unpkg.com/@agentix-e/entity-resolver-core@latest/wasm/scorers.wasm',
  ],
});
```

## 7. "PPRL in browser" — encodePPRL throws crypto error

**Symptoms:** `ReferenceError: crypto is not defined` or `createHash is not a function` in browser.

**Root cause:** `encodePPRL()` uses Node.js `crypto.createHash('sha256')` synchronously. Browsers only support async Web Crypto API.

**Fix: Use the async API in browser contexts.**

```typescript
import { encodePPRLAsync, matchPPRLAsync } from '@agentix-e/entity-resolver-core';

// WRONG — Node.js only, sync crypto
// const bf = encodePPRL('John Smith', config);

// CORRECT — Browser-compatible async API
const config = {
  secretKey: 'shared-secret-key',
  filterSize: 1024,
  numHashes: 15,
  qgramSize: 2,
};

const bf1 = await encodePPRLAsync('John Smith', config);
const bf2 = await encodePPRLAsync('Jon Smyth', config);
const dice = bf1.similarity(bf2);
console.log(`PPRL similarity: ${dice.toFixed(3)}`);
```

The async functions use Web Crypto `subtle.digest('SHA-256')` with Node.js fallback.

## 8. "LLM scorer not working" — scoreWithLLM returns errors

**Symptoms:** `LLMError: DeepSeek API key not configured` or 401/403 HTTP responses.

**Fix: Set the DEEPSEEK_API_KEY environment variable.**

```bash
# Linux/macOS
export DEEPSEEK_API_KEY=sk-your-actual-api-key

# Windows PowerShell
$env:DEEPSEEK_API_KEY="sk-your-actual-api-key"

# Docker
docker run -e DEEPSEEK_API_KEY=sk-your-key ... entity-resolver:latest
```

**Usage in code:**

```typescript
import { scoreWithLLM } from '@agentix-e/entity-resolver-core';

const result = await scoreWithLLM(
  'Apple iPhone 14 Pro 256GB',
  'iPhone 14 Pro 256GB Space Black',
  {
    model: 'deepseek-chat',
    temperature: 0.0,
    maxTokens: 100,
  },
);

if (result.error) {
  console.error(`LLM error: ${result.error}`);
} else {
  console.log(`LLM score: ${result.score} (confidence: ${result.confidence})`);
}
```

The LLM scorer uses circuit breaker pattern — after 5 consecutive failures, it stops attempting for 30 seconds. Reset manually:

```typescript
import { resetCircuitBreaker } from '@agentix-e/entity-resolver-core';
resetCircuitBreaker();
```

## 9. "MCP server not connecting" — SSE transport issues

**Symptoms:** MCP client (Claude, Cursor, etc.) cannot connect to the MCP server. `Connection refused` or `405 Method Not Allowed`.

**Fix: Ensure MCP endpoint is configured correctly.**

The MCP server supports JSON-RPC 2.0 over HTTP POST at `/api/v1/mcp/execute`:

```bash
# Initialize MCP session
curl -X POST http://localhost:3000/api/v1/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": { "name": "test-client", "version": "1.0" }
    }
  }'

# List tools
curl -X POST http://localhost:3000/api/v1/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{"tool": "tools/list"}'

# Execute a tool
curl -X POST http://localhost:3000/api/v1/mcp/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "entity_resolver_deduplicate",
    "params": {
      "records": [
        {"name": "John Smith", "city": "NYC"},
        {"name": "Jon Smith", "city": "NYC"}
      ]
    }
  }'
```

**Authentication note:** MCP endpoints respect the same auth configuration as REST endpoints. Pass your API key or JWT:

```bash
curl -H "Authorization: Bearer sk-your-api-key" \
  http://localhost:3000/api/v1/mcp/execute \
  -d '{"tool": "tools/list"}'
```

## 10. "TypeScript type errors" — Import mismatches

**Symptoms:** `Property 'x' does not exist on type 'Y'`, `Cannot find module`, or `Type 'string' is not assignable to type...`.

**Common fixes:**

**A) Interface contract violations.** The core package defines DI interfaces; implementations must conform exactly:

```typescript
import type { IScorer, FieldMetadata } from '@agentix-e/entity-resolver-core';

// CORRECT: implements the interface contract
class MyScorer implements IScorer {
  readonly name = 'my_scorer';

  score(a: unknown, b: unknown, field: FieldMetadata): number {
    // implementation
    return String(a) === String(b) ? 1 : 0;
  }
}
```

**B) DI boundary issues.** Don't mix Node.js and Browser packages in the same context:

```typescript
// WRONG: importing browser adapter in Node.js
// import { BrowserDuckDBBackend } from '@agentix-e/entity-resolver-browser';

// CORRECT: use the appropriate package
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

// CORRECT for universal code: use core interfaces
import type { ISqlBackend } from '@agentix-e/entity-resolver-core';
function processData(backend: ISqlBackend) {
  // works with any backend implementation
}
```

**C) Strict mode issues.** The project uses `exactOptionalPropertyTypes`. Optional fields must be explicitly checked:

```typescript
// CORRECT: handle optional properties
interface Config {
  timeout?: number;
}
const cfg: Config = {};
if (cfg.timeout !== undefined) {
  // safe to use cfg.timeout
}
// WRONG: direct access without check
// const t: number = cfg.timeout; // Type 'undefined' not assignable
```
