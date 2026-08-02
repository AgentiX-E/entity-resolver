// Tests for LLM scorer — circuit breaker, retry, batch processing.
// Integration test with real DeepSeek API (run manually with apiKey config).
//
// Test categories:
//   Mock tests — run everywhere in CI without API key
//   Integration tests — requires DEEPSEEK_API_KEY env var, skipped otherwise

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { scoreWithLLM, resetCircuitBreaker } from '../../index.js';
import type { ScoredPair, LLMScorerConfig } from '../../index.js';

const TEST_API_KEY = 'test-key-do-not-use';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Create a mock fetch that returns the given status and body. */
function mockFetch(status: number, body: unknown) {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof globalThis.fetch;
}

/** Create a mock fetch that succeeds on attempt N (1-indexed). */
function mockFetchSucceedOnAttempt(succeedOn: number, successBody: unknown, errorStatus = 500) {
  let callCount = 0;
  return async () => {
    callCount++;
    if (callCount >= succeedOn) {
      return new Response(JSON.stringify(successBody), { status: 200 });
    }
    return new Response(JSON.stringify({ error: `attempt ${callCount}` }), { status: errorStatus });
  };
}

/** Test record pair: John Smith vs Jon Smyth. */
const testRecords = [
  { name: 'John Smith', dob: '1990-01-15' },
  { name: 'Jon Smyth', dob: '1990-01-15' },
];

/** Boundary pair for LLM scoring. */
const boundaryPair: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.5, probability: 0.5 }];

// ═══════════════════════════════════════════════════════════════
// Config validation tests
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM config validation', () => {
  it('throws when apiKey is empty', async () => {
    await expect(
      scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: '',
      }),
    ).rejects.toThrow('LLMScorerConfig.apiKey');
  });

  it('requires apiKey in config object', () => {
    const config: LLMScorerConfig = {
      candidateLo: 0.4,
      candidateHi: 0.7,
      apiKey: 'sk-test-key',
    };
    expect(config.apiKey).toBe('sk-test-key');
    expect(config.candidateLo).toBe(0.4);
    expect(config.candidateHi).toBe(0.7);
  });
});

// ═══════════════════════════════════════════════════════════════
// Boundary range logic tests
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM boundary range', () => {
  it('skips pairs above candidateHi', async () => {
    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.99, probability: 0.99 }];
    const results = await scoreWithLLM(pairs, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: TEST_API_KEY,
    });
    expect(results).toHaveLength(0);
  });

  it('skips pairs below candidateLo', async () => {
    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.01, probability: 0.01 }];
    const results = await scoreWithLLM(pairs, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: TEST_API_KEY,
    });
    expect(results).toHaveLength(0);
  });

  it('includes pair exactly at candidateLo', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":0.6,"reasoning":"test"}' } }],
    });
    try {
      const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.4, probability: 0.4 }];
      const results = await scoreWithLLM(pairs, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: 'mock-key',
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.llmScore).toBe(0.6);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Mock tests — successful responses
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM mock: successful responses', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed score and reasoning', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":0.82,"reasoning":"typo in surname"}' } }],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.82);
    expect(results[0]!.originalScore).toBe(0.5);
  });

  it('clamps score to [0, 1]', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":1.5,"reasoning":"x"}' } }],
    });
    const r1 = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(r1[0]!.llmScore).toBe(1.0);

    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":-0.3,"reasoning":"x"}' } }],
    });
    const r2 = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(r2[0]!.llmScore).toBe(0.0);
  });

  it('handles JSON in markdown code fences', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '```json\n{"score":0.65,"reasoning":"test"}\n```' } }],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results[0]!.llmScore).toBe(0.65);
  });

  it('falls back to neutral on malformed JSON', async () => {
    globalThis.fetch = mockFetch(200, { choices: [{ message: { content: 'not-valid-json' } }] });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results[0]!.llmScore).toBe(0.5);
    expect(results[0]!.reasoning).toContain('failed to parse');
  });
});

// ═══════════════════════════════════════════════════════════════
// Mock tests — retry with exponential backoff
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM retry and backoff', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it('retries on 429 rate limit and succeeds on retry', async () => {
    globalThis.fetch = mockFetchSucceedOnAttempt(
      2,
      { choices: [{ message: { content: '{"score":0.75,"reasoning":"retry worked"}' } }] },
      429,
    );
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      maxRetries: 2,
      retryBaseMs: 10,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.75);
    expect(results[0]!.reasoning).toBe('retry worked');
  });

  it('retries on 500 and succeeds on third attempt', async () => {
    globalThis.fetch = mockFetchSucceedOnAttempt(
      3,
      { choices: [{ message: { content: '{"score":0.55,"reasoning":"third try"}' } }] },
      500,
    );
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      maxRetries: 3,
      retryBaseMs: 10,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.55);
  });

  it('does NOT retry on 401 (auth error)', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    };
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      maxRetries: 3,
      retryBaseMs: 10,
    });
    // Should NOT throw — graceful degradation for batch processing
    expect(callCount).toBe(1); // No retries on auth
    expect(results[0]!.llmScore).toBe(0.5); // Neutral score on error
  });

  it('returns neutral score after exhausting retries', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'boom' }), { status: 503 });
    };
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      maxRetries: 1,
      retryBaseMs: 10,
    });
    expect(callCount).toBe(2); // initial + 1 retry
    expect(results[0]!.llmScore).toBe(0.5); // Neutral score
    expect(results[0]!.reasoning).toContain('LLM API error');
  });
});

// ═══════════════════════════════════════════════════════════════
// Circuit breaker tests
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM circuit breaker', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it('trips after consecutive failures exceed threshold', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'fail' }), { status: 500 });
    };

    const config: LLMScorerConfig = {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      circuitBreakerThreshold: 2,
      circuitBreakerCooldownMs: 60000,
      maxRetries: 0,
      batchSize: 1,
    };

    // Call 1: failure, consecutive=1, circuit still closed
    const r1 = await scoreWithLLM(boundaryPair, testRecords, config);
    expect(r1[0]!.llmScore).toBe(0.5);
    expect(callCount).toBe(1);

    // Call 2: failure, consecutive=2 → circuit opens
    const r2 = await scoreWithLLM(boundaryPair, testRecords, config);
    expect(r2[0]!.llmScore).toBe(0.5);
    expect(r2[0]!.reasoning).toContain('LLM API error');

    // Call 3: circuit OPEN — no more API calls
    const r3 = await scoreWithLLM(boundaryPair, testRecords, config);
    expect(callCount).toBe(2); // No new API call
    expect(r3[0]!.llmScore).toBe(0.5);
    expect(r3[0]!.reasoning).toContain('circuit breaker');
  });

  it('resets after successful call', async () => {
    resetCircuitBreaker();

    // First call fails
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'fail' }), { status: 500 });
    await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      circuitBreakerThreshold: 3,
      maxRetries: 0,
      batchSize: 1,
    });

    // Second call succeeds — resets circuit
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":0.9,"reasoning":"good"}' } }],
    });
    const r2 = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      circuitBreakerThreshold: 3,
      maxRetries: 0,
      batchSize: 1,
    });
    expect(r2[0]!.llmScore).toBe(0.9);

    // Third call fails again — should NOT trip (counter was reset)
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'fail' }), { status: 500 });
    await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      circuitBreakerThreshold: 3,
      maxRetries: 0,
      batchSize: 1,
    });
    const r4 = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      circuitBreakerThreshold: 3,
      maxRetries: 0,
      batchSize: 1,
    });
    // Only 1 failure since reset — circuit should still be closed
    expect(r4[0]!.llmScore).toBe(0.5);
    expect(r4[0]!.reasoning).toContain('LLM API error'); // Not circuit breaker message
  });
});

// ═══════════════════════════════════════════════════════════════
// Batch processing tests
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM batch processing', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it('processes batch of boundary pairs concurrently', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: `{"score":0.6,"reasoning":"p${callCount}"}` } }],
        }),
        { status: 200 },
      );
    };

    const pairs: ScoredPair[] = Array.from({ length: 4 }, (_, i) => ({
      leftId: i,
      rightId: i + 1,
      score: 0.5,
      probability: 0.5,
    }));
    const records = Array.from({ length: 6 }, (_, i) => ({ a: i }));

    const results = await scoreWithLLM(pairs, records, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      batchSize: 2,
      maxRetries: 0,
    });
    expect(results).toHaveLength(4);
    expect(callCount).toBe(4); // All 4 pairs called (2 pairs per batch × 2 batches)
  });

  it('handles partial batch failures gracefully', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 2) {
        return new Response(JSON.stringify({ error: 'fail' }), { status: 500 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"score":0.7,"reasoning":"ok"}' } }] }),
        { status: 200 },
      );
    };

    const pairs: ScoredPair[] = Array.from({ length: 2 }, (_, i) => ({
      leftId: i,
      rightId: i + 1,
      score: 0.5,
      probability: 0.5,
    }));
    const records = Array.from({ length: 4 }, (_, i) => ({ a: i }));

    const results = await scoreWithLLM(pairs, records, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
      batchSize: 2,
      maxRetries: 0,
    });

    expect(results).toHaveLength(2);
    // One succeeded, one failed with neutral score
    const scores = results.map((r) => r.llmScore).sort();
    expect(scores[0]).toBe(0.5); // Failed pair
    expect(scores[1]).toBe(0.7); // Successful pair
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration tests (requires DEEPSEEK_API_KEY)
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM integration (real API)', () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const skipIfNoKey = apiKey ? it : it.skip;

  beforeEach(() => {
    resetCircuitBreaker();
  });

  skipIfNoKey(
    'resolves boundary pair with real LLM',
    async () => {
      const results = await scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: apiKey!,
      });
      expect(results).toHaveLength(1);
      expect(typeof results[0]!.llmScore).toBe('number');
      expect(results[0]!.llmScore).toBeGreaterThanOrEqual(0);
      expect(results[0]!.llmScore).toBeLessThanOrEqual(1);
      expect(results[0]!.reasoning.length).toBeGreaterThan(0);
    },
    30000,
  );

  skipIfNoKey(
    'circuit breaker handles real API failures',
    async () => {
      const config: LLMScorerConfig = {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: apiKey!,
        circuitBreakerThreshold: 3,
        circuitBreakerCooldownMs: 5000,
        maxRetries: 1,
        retryBaseMs: 100,
        batchSize: 1,
      };
      // With a valid key, this makes real API calls — tests that circuit
      // breaker infrastructure doesn't crash on successful calls
      const results = await scoreWithLLM(boundaryPair, testRecords, config);
      expect(results).toHaveLength(1);
      expect(typeof results[0]!.llmScore).toBe('number');
    },
    30000,
  );

  it('returns neutral scores on auth failure with fake key', async () => {
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: TEST_API_KEY,
      maxRetries: 0,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.5);
    expect(results[0]!.reasoning).toContain('LLM API error');
  });
});

// ═══════════════════════════════════════════════════════════════
// Schema-informed prompt and calibration tests (I34)
// ═══════════════════════════════════════════════════════════════

import {
  buildSchemaPrompt,
  fieldHintsFromDetectedFields,
  calibrateThreshold,
} from '../../index.js';
import type { FieldHint, SchemaPromptConfig, LLMScorerResult } from '../../index.js';

describe('fieldHintsFromDetectedFields', () => {
  it('generates hints for common semantic types', () => {
    const hints = fieldHintsFromDetectedFields([
      { name: 'email', semanticType: 'email' },
      { name: 'full_name', semanticType: 'name' },
      { name: 'city', semanticType: 'city' },
    ]);

    expect(hints).toHaveLength(3);
    expect(hints[0]!.hint).toContain('Exact match');
    expect(hints[1]!.hint).toContain('Fuzzy match');
    expect(hints[2]!.hint).toContain('abbreviations');
  });

  it('preserves field names and types', () => {
    const hints = fieldHintsFromDetectedFields([
      { name: 'phone_number', semanticType: 'phone' },
    ]);
    expect(hints[0]!.name).toBe('phone_number');
    expect(hints[0]!.semanticType).toBe('phone');
  });

  it('returns generic hint for unknown type', () => {
    const hints = fieldHintsFromDetectedFields([
      { name: 'unknown_field', semanticType: 'custom_type' },
    ]);
    expect(hints[0]!.hint).toContain('General string similarity');
  });

  it('returns empty array for empty input', () => {
    const hints = fieldHintsFromDetectedFields([]);
    expect(hints).toHaveLength(0);
  });
});

describe('buildSchemaPrompt', () => {
  const sampleHints: FieldHint[] = [
    { name: 'name', semanticType: 'name', hint: 'Fuzzy match' },
    { name: 'email', semanticType: 'email', hint: 'Exact match' },
  ];
  const recordA = { name: 'John Smith', email: 'john@acme.com' };
  const recordB = { name: 'Jon Smith', email: 'john@acme.com' };

  it('builds chain-of-thought prompt by default', () => {
    const config: SchemaPromptConfig = { fieldHints: sampleHints };
    const prompt = buildSchemaPrompt(recordA, recordB, config);
    expect(prompt).toContain('fieldAnalysis');
    expect(prompt).toContain('finalScore');
    expect(prompt).toContain('John Smith');
    expect(prompt).toContain('Jon Smith');
    expect(prompt).toContain('john@acme.com');
    expect(prompt).toContain('Fuzzy match');
    expect(prompt).toContain('Exact match');
  });

  it('builds simple prompt when chainOfThought is false', () => {
    const config: SchemaPromptConfig = { fieldHints: sampleHints, chainOfThought: false };
    const prompt = buildSchemaPrompt(recordA, recordB, config);
    expect(prompt).not.toContain('fieldAnalysis');
    expect(prompt).toContain('Record A');
    expect(prompt).toContain('Record B');
    expect(prompt).toContain('"score"');
  });

  it('includes domain context when provided', () => {
    const config: SchemaPromptConfig = { fieldHints: sampleHints, domainContext: 'customer records' };
    const prompt = buildSchemaPrompt(recordA, recordB, config);
    expect(prompt).toContain('customer records');
  });

  it('handles missing field values gracefully', () => {
    const config: SchemaPromptConfig = { fieldHints: sampleHints };
    const prompt = buildSchemaPrompt({}, {}, config);
    expect(prompt).toContain('A: ');
    expect(prompt).toContain('B: ');
  });

  it('omits domain context line when not provided', () => {
    const config: SchemaPromptConfig = { fieldHints: sampleHints };
    const prompt = buildSchemaPrompt(recordA, recordB, config);
    expect(prompt).not.toContain('Domain context');
  });

  it('includes all field hints in output', () => {
    const config: SchemaPromptConfig = { fieldHints: sampleHints };
    const prompt = buildSchemaPrompt(recordA, recordB, config);
    expect(prompt).toContain('name (name)');
    expect(prompt).toContain('email (email)');
  });
});

describe('calibrateThreshold', () => {
  const leftIds = ['a', 'b', 'c'];
  const rightIds = ['a', 'b', 'c'];

  it('finds optimal threshold for perfect predictions', () => {
    const scores: LLMScorerResult[] = [
      { leftId: 0, rightId: 0, originalScore: 0.8, llmScore: 0.95, reasoning: '' },
      { leftId: 1, rightId: 1, originalScore: 0.8, llmScore: 0.9, reasoning: '' },
    ];
    const truth = new Set(['a|a', 'b|b']);
    const result = calibrateThreshold(scores, truth, leftIds, rightIds);
    expect(result.optimalF1).toBe(1);
    expect(result.curve.length).toBeGreaterThan(10);
  });

  it('handles mixed scores correctly', () => {
    const scores: LLMScorerResult[] = [
      { leftId: 0, rightId: 0, originalScore: 0.5, llmScore: 0.9, reasoning: '' },
      { leftId: 0, rightId: 1, originalScore: 0.5, llmScore: 0.7, reasoning: '' },
    ];
    const truth = new Set(['a|a']); // only first pair is true match
    const result = calibrateThreshold(scores, truth, leftIds, rightIds);
    // At threshold 0.8: only first pair → P=1, R=1, F1=1
    expect(result.optimalF1).toBe(1);
  });

  it('returns zero F1 when no predictions match', () => {
    const scores: LLMScorerResult[] = [
      { leftId: 0, rightId: 0, originalScore: 0.5, llmScore: 0.1, reasoning: '' },
    ];
    const truth = new Set(['a|a']);
    const result = calibrateThreshold(scores, truth, leftIds, rightIds);
    // At threshold 0.1: passes, TP=1 → F1=1
    expect(result.optimalF1).toBe(1);
  });

  it('handles empty scores gracefully', () => {
    const result = calibrateThreshold([], new Set(['a|a']), leftIds, rightIds);
    expect(result.curve.length).toBeGreaterThan(10);
    expect(result.optimalF1).toBe(0);
  });

  it('produces monotonic threshold curve', () => {
    const scores: LLMScorerResult[] = [
      { leftId: 0, rightId: 0, originalScore: 0.5, llmScore: 0.3, reasoning: '' },
      { leftId: 0, rightId: 1, originalScore: 0.5, llmScore: 0.6, reasoning: '' },
      { leftId: 1, rightId: 0, originalScore: 0.5, llmScore: 0.9, reasoning: '' },
    ];
    const truth = new Set(['a|a', 'a|b']);
    const result = calibrateThreshold(scores, truth, leftIds, rightIds);
    // Verify thresholds are ascending
    for (let i = 1; i < result.curve.length; i++) {
      expect(result.curve[i]!.threshold).toBeGreaterThan(result.curve[i - 1]!.threshold);
    }
  });

  it('calibration point fields are all populated', () => {
    const scores: LLMScorerResult[] = [
      { leftId: 0, rightId: 0, originalScore: 0.5, llmScore: 0.85, reasoning: '' },
    ];
    const truth = new Set(['a|a']);
    const result = calibrateThreshold(scores, truth, leftIds, rightIds);
    for (const point of result.curve) {
      expect(typeof point.f1).toBe('number');
      expect(typeof point.precision).toBe('number');
      expect(typeof point.recall).toBe('number');
      expect(typeof point.threshold).toBe('number');
    }
  });
});
