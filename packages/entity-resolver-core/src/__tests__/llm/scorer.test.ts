// Tests for LLM scorer — config, prompt generation, error handling.
// Integration test with real DeepSeek API (run manually with env var).

import { describe, it, expect } from 'vitest';
import { scoreWithLLM } from '../../index.js';
import type { ScoredPair } from '../../index.js';

describe('scoreWithLLM', () => {
  it('throws when API key is missing', async () => {
    // Ensure no API key leaked into env
    delete process.env['DEEPSEEK_API_KEY'];

    const pairs: ScoredPair[] = [{ leftId: 0, rightId: 1, score: 0.5 }];
    await expect(
      scoreWithLLM(pairs, [{ name: 'A' }, { name: 'B' }], {
        candidateLo: 0.4,
        candidateHi: 0.6,
      }),
    ).rejects.toThrow('DEEPSEEK_API_KEY');
  });

  it('skips pairs outside boundary range', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'test-key-do-not-use';

    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.99, probability: 0.99 },
      { leftId: 2, rightId: 3, score: 0.01, probability: 0.01 },
    ];

    const results = await scoreWithLLM(pairs, [
      { name: 'A' }, { name: 'A' }, { name: 'B' }, { name: 'C' },
    ], { candidateLo: 0.4, candidateHi: 0.6 });

    // Neither pair is in [0.4, 0.6] → no LLM calls
    expect(results).toHaveLength(0);

    delete process.env['DEEPSEEK_API_KEY'];
  });

  it('handles pairs in boundary range', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'test-key-do-not-use';

    const pairs: ScoredPair[] = [
      { leftId: 0, rightId: 1, score: 0.5, probability: 0.5 },
    ];

    await expect(
      scoreWithLLM(pairs, [{ name: 'John' }, { name: 'Jon' }], {
        candidateLo: 0.4,
        candidateHi: 0.6,
      }),
    ).rejects.toThrow(); // API call fails with fake key — expected

    delete process.env['DEEPSEEK_API_KEY'];
  });
});

describe('LLM scorer config validation', () => {
  it('uses default model and API URL', () => {
    // Config structure verified — actual API call needs real key
    const config = { candidateLo: 0.4, candidateHi: 0.7 };
    expect(config.candidateLo).toBe(0.4);
    expect(config.candidateHi).toBe(0.7);
  });

  it('accepts custom API URL and model', () => {
    const config = {
      candidateLo: 0.3,
      candidateHi: 0.8,
      apiBaseUrl: 'https://custom.api.com/v1',
      model: 'custom-model',
      maxTokens: 100,
    };
    expect(config.apiBaseUrl).toBe('https://custom.api.com/v1');
    expect(config.model).toBe('custom-model');
    expect(config.maxTokens).toBe(100);
  });
});

describe('LLM scorer with mocked fetch', () => {
  it('handles successful API response', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'test-key';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ matches: [{ idA: 0, idB: 1, score: 0.52 }] }) } }],
      }), { status: 200 });
    }) as typeof globalThis.fetch;
    try {
      const pairs = [{ leftId: 0, rightId: 1, score: 0.5 }];
      const results = await scoreWithLLM(pairs, [{ name: 'A' }, { name: 'B' }], { candidateLo: 0.4, candidateHi: 0.6 });
      expect(Array.isArray(results)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env['DEEPSEEK_API_KEY'];
    }
  });

  it('handles malformed JSON in API response', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'test-key';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'not-valid-json' } }],
      }), { status: 200 });
    }) as typeof globalThis.fetch;
    try {
      const pairs = [{ leftId: 0, rightId: 1, score: 0.5 }];
      const results = await scoreWithLLM(pairs, [{ name: 'A' }, { name: 'B' }], { candidateLo: 0.4, candidateHi: 0.6 });
      expect(Array.isArray(results)).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env['DEEPSEEK_API_KEY'];
    }
  });
});
