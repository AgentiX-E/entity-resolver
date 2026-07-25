// Tests for LLM scorer — config, prompt generation, error handling.
// Integration test with real DeepSeek API (run manually with apiKey config).
//
// Test categories:
//   Mock tests — run everywhere in CI without API key
//   Integration tests — requires DEEPSEEK_API_KEY env var, skipped otherwise

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scoreWithLLM } from '../../index.js';
import type { ScoredPair, LLMScorerConfig } from '../../index.js';

const TEST_API_KEY = 'test-key-do-not-use';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Create a mock fetch that returns the given status and body. */
function mockFetch(status: number, body: unknown) {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof globalThis.fetch;
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

  it('accepts custom API URL and model', () => {
    const config: LLMScorerConfig = {
      candidateLo: 0.3,
      candidateHi: 0.8,
      apiKey: 'sk-custom-key',
      apiBaseUrl: 'https://custom.api.com/v1',
      model: 'custom-model',
      maxTokens: 100,
    };
    expect(config.apiBaseUrl).toBe('https://custom.api.com/v1');
    expect(config.model).toBe('custom-model');
    expect(config.maxTokens).toBe(100);
    expect(config.apiKey).toBe('sk-custom-key');
  });
});

// ═══════════════════════════════════════════════════════════════
// Boundary range logic tests
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM boundary range', () => {
  it('skips pairs above candidateHi', async () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.99, probability: 0.99 },
      { leftId: 2, rightId: 3, score: 0.98, probability: 0.98 },
    ];
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

  it('includes pair exactly at candidateHi', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":0.55,"reasoning":"test"}' } }],
    });
    try {
      const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.6, probability: 0.6 }];
      const results = await scoreWithLLM(pairs, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: 'mock-key',
      });
      expect(results).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Mock tests — successful API responses
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM mock: successful responses', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed score and reasoning from valid JSON response', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [
        { message: { content: '{"score":0.82,"reasoning":"same person, typo in surname"}' } },
      ],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.82);
    expect(results[0]!.reasoning).toBe('same person, typo in surname');
    expect(results[0]!.originalScore).toBe(0.5);
  });

  it('clamps score to [0, 1] range', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":1.5,"reasoning":"x"}' } }],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results[0]!.llmScore).toBe(1.0);

    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: '{"score":-0.3,"reasoning":"x"}' } }],
    });
    const results2 = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results2[0]!.llmScore).toBe(0.0);
  });

  it('handles JSON wrapped in markdown code fences', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [
        {
          message: { content: '```json\n{"score":0.65,"reasoning":"test"}\n```' },
        },
      ],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results[0]!.llmScore).toBe(0.65);
  });

  it('handles JSON without markdown fences (plain code block)', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [
        {
          message: { content: '```\n{"score":0.71,"reasoning":"test"}\n```' },
        },
      ],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results[0]!.llmScore).toBe(0.71);
  });

  it('falls back to 0.5 and default reasoning on malformed JSON', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: { content: 'not-valid-json-at-all' } }],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.5);
    expect(results[0]!.reasoning).toContain('failed to parse');
  });

  it('handles empty choices array gracefully', async () => {
    globalThis.fetch = mockFetch(200, { choices: [] });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.5);
  });

  it('handles missing message.content gracefully', async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [{ message: {} }],
    });
    const results = await scoreWithLLM(boundaryPair, testRecords, {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.llmScore).toBe(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Mock tests — error responses
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM mock: error responses', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws on 401 Unauthorized', async () => {
    globalThis.fetch = mockFetch(401, { error: 'Unauthorized' });
    await expect(
      scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: 'bad-key',
      }),
    ).rejects.toThrow('LLM API error 401');
  });

  it('throws on 429 Rate Limited', async () => {
    globalThis.fetch = mockFetch(429, { error: 'Too Many Requests' });
    await expect(
      scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: 'mock-key',
      }),
    ).rejects.toThrow('LLM API error 429');
  });

  it('throws on 500 Internal Server Error', async () => {
    globalThis.fetch = mockFetch(500, { error: 'Internal Error' });
    await expect(
      scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: 'mock-key',
      }),
    ).rejects.toThrow('LLM API error 500');
  });

  it('throws on 503 Service Unavailable', async () => {
    globalThis.fetch = mockFetch(503, { error: 'Service Unavailable' });
    await expect(
      scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: 'mock-key',
      }),
    ).rejects.toThrow('LLM API error 503');
  });
});

// ═══════════════════════════════════════════════════════════════
// Mock tests — multi-pair batching
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM mock: multi-pair', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('processes multiple boundary pairs', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: `{"score":0.${callCount + 5},"reasoning":"p${callCount}"}` } },
          ],
        }),
        { status: 200 },
      );
    };

    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.45 },
      { leftId: 1, rightId: 2, score: 0.55 },
      { leftId: 2, rightId: 3, score: 0.5 },
    ];
    const results = await scoreWithLLM(pairs, [{ a: 1 }, { a: 1 }, { a: 2 }, { a: 2 }], {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results).toHaveLength(3);
    expect(callCount).toBe(3);
  });

  it('mixes in-range and out-of-range pairs correctly', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"score":0.6,"reasoning":"ok"}' } }],
        }),
        { status: 200 },
      );
    };

    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.99 }, // out of range (high)
      { leftId: 1, rightId: 2, score: 0.5 }, // in range
      { leftId: 2, rightId: 3, score: 0.01 }, // out of range (low)
      { leftId: 3, rightId: 4, score: 0.55 }, // in range
    ];
    const results = await scoreWithLLM(pairs, [{ a: 0 }, { a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }], {
      candidateLo: 0.4,
      candidateHi: 0.6,
      apiKey: 'mock-key',
    });
    expect(results).toHaveLength(2); // only 2 in-range
    expect(callCount).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration tests (requires DEEPSEEK_API_KEY)
// ═══════════════════════════════════════════════════════════════

describe('scoreWithLLM integration (real API)', () => {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  const skipIfNoKey = apiKey ? it : it.skip;

  skipIfNoKey(
    'resolves boundary pair with real LLM',
    async () => {
      const results = await scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: apiKey!,
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.leftId).toBe(0);
      expect(results[0]!.rightId).toBe(1);
      expect(typeof results[0]!.llmScore).toBe('number');
      expect(results[0]!.llmScore).toBeGreaterThanOrEqual(0);
      expect(results[0]!.llmScore).toBeLessThanOrEqual(1);
      expect(typeof results[0]!.reasoning).toBe('string');
      expect(results[0]!.reasoning.length).toBeGreaterThan(0);
    },
    30000,
  );

  skipIfNoKey(
    'returns original score in output',
    async () => {
      const results = await scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: apiKey!,
      });
      expect(results[0]!.originalScore).toBe(0.5);
    },
    30000,
  );

  skipIfNoKey(
    'skips pairs not in boundary range (integration)',
    async () => {
      const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.99, probability: 0.99 }];
      const results = await scoreWithLLM(pairs, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: apiKey!,
      });
      expect(results).toHaveLength(0);
    },
    15000,
  );

  // Keep the original fake-key test (expects API failure)
  it('handles pairs in boundary range (API call fails with fake key)', async () => {
    await expect(
      scoreWithLLM(boundaryPair, testRecords, {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: TEST_API_KEY,
      }),
    ).rejects.toThrow();
  });
});
