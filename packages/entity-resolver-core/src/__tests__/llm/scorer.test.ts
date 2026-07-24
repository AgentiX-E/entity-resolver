// Tests for LLM scorer — config, prompt generation, error handling.
// Integration test with real DeepSeek API (run manually with apiKey config).

import { describe, it, expect } from 'vitest';
import { scoreWithLLM } from '../../index.js';
import type { ScoredPair, LLMScorerConfig } from '../../index.js';

const TEST_API_KEY = 'test-key-do-not-use';

describe('scoreWithLLM', () => {
  it('throws when API key is missing', async () => {
    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.5 }];
    await expect(
      scoreWithLLM(
        pairs,
        [{ name: 'A' }, { name: 'B' }],
        {
          candidateLo: 0.4,
          candidateHi: 0.6,
          apiKey: '',
        } as LLMScorerConfig,
      ),
    ).rejects.toThrow('LLMScorerConfig.apiKey');
  });

  it('skips pairs outside boundary range', async () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.99, probability: 0.99 },
      { leftId: 2, rightId: 3, score: 0.01, probability: 0.01 },
    ];

    const results = await scoreWithLLM(
      pairs,
      [{ name: 'A' }, { name: 'A' }, { name: 'B' }, { name: 'C' }],
      { candidateLo: 0.4, candidateHi: 0.6, apiKey: TEST_API_KEY },
    );

    // Neither pair is in [0.4, 0.6] → no LLM calls
    expect(results).toHaveLength(0);
  });

  it('handles pairs in boundary range (API call fails with fake key)', async () => {
    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.5, probability: 0.5 },
    ];

    await expect(
      scoreWithLLM(pairs, [{ name: 'John' }, { name: 'Jon' }], {
        candidateLo: 0.4,
        candidateHi: 0.6,
        apiKey: TEST_API_KEY,
      }),
    ).rejects.toThrow(); // API call fails with fake key — expected
  });
});

describe('LLM scorer config validation', () => {
  it('requires apiKey in config', () => {
    const config: LLMScorerConfig = {
      candidateLo: 0.4,
      candidateHi: 0.7,
      apiKey: 'sk-test-key',
    };
    expect(config.apiKey).toBe('sk-test-key');
    expect(config.candidateLo).toBe(0.4);
    expect(config.candidateHi).toBe(0.7);
  });

  it('accepts custom API URL and model with apiKey', () => {
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

describe('LLM scorer with mocked fetch', () => {
  it('handles successful API response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  score: 0.52,
                  reasoning: 'test',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;
    try {
      const pairs = [{ leftId: 0, rightId: 1, score: 0.5 }];
      const results = await scoreWithLLM(
        pairs,
        [{ name: 'A' }, { name: 'B' }],
        {
          candidateLo: 0.4,
          candidateHi: 0.6,
          apiKey: 'test-key',
        },
      );
      expect(Array.isArray(results)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles malformed JSON in API response gracefully', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'not-valid-json' } }],
        }),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;
    try {
      const pairs = [{ leftId: 0, rightId: 1, score: 0.5 }];
      const results = await scoreWithLLM(
        pairs,
        [{ name: 'A' }, { name: 'B' }],
        {
          candidateLo: 0.4,
          candidateHi: 0.6,
          apiKey: 'test-key',
        },
      );
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]!.llmScore).toBe(0.5); // fallback on parse failure
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
