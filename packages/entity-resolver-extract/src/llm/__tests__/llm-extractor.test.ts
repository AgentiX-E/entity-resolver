import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { llmExtract, resetLLMCircuitBreaker, getCircuitBreakerState } from '../llm-extractor.js';
import type { FieldDescriptor } from '../../extractor.js';

const originalEnv = process.env['DEEPSEEK_API_KEY'];

describe('llmExtract', () => {
  beforeAll(() => {
    // Save original env
  });

  afterAll(() => {
    // Restore env
    process.env['DEEPSEEK_API_KEY'] = originalEnv;
  });

  // ── Graceful degradation ──────────────────────────────────────────

  describe('graceful degradation (no API key)', () => {
    beforeAll(() => {
      delete process.env['DEEPSEEK_API_KEY'];
      resetLLMCircuitBreaker();
    });

    afterAll(() => {
      process.env['DEEPSEEK_API_KEY'] = originalEnv;
    });

    it('returns not-attempted when no API key is configured', async () => {
      const result = await llmExtract('test text', [{ name: 'field', type: 'string' }]);

      expect(result.attempted).toBe(false);
      expect(result.values).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('returns not-attempted for any field type', async () => {
      const fields: FieldDescriptor[] = [
        { name: 'name', type: 'string' },
        { name: 'age', type: 'number' },
        { name: 'active', type: 'boolean' },
      ];
      const result = await llmExtract('John is 25', fields);
      expect(result.attempted).toBe(false);
    });
  });

  // ── Circuit breaker ───────────────────────────────────────────────

  describe('circuit breaker', () => {
    it('circuit breaker starts closed', () => {
      resetLLMCircuitBreaker();
      const state = getCircuitBreakerState();
      expect(state.isOpen).toBe(false);
      expect(state.failures).toBe(0);
    });

    it('reset clears circuit breaker state', () => {
      resetLLMCircuitBreaker();
      const state = getCircuitBreakerState();
      expect(state.failures).toBe(0);
      expect(state.isOpen).toBe(false);
    });
  });

  // ── Live API test (skipped if no key) ─────────────────────────────

  describe('live DeepSeek extraction', () => {
    beforeAll(() => {
      if (!process.env['DEEPSEEK_API_KEY']) {
        // Restore from .env if not set
        // In CI, this test will skip gracefully
      }
    });

    it('extracts name and age from text via DeepSeek', async () => {
      const hasKey = !!process.env['DEEPSEEK_API_KEY'];
      if (!hasKey) {
        console.log('Skipping live API test — no DEEPSEEK_API_KEY');
        return;
      }

      const result = await llmExtract('John Smith is 25 years old and lives in New York', [
        { name: 'name', type: 'string', description: 'Full name' },
        { name: 'age', type: 'number', description: 'Age' },
        { name: 'city', type: 'string', description: 'City name' },
      ]);

      expect(result.attempted).toBe(true);
      if (result.values) {
        expect(result.values.name).toBeDefined();
        expect(result.values.age).toBeDefined();
        expect(result.values.city).toBeDefined();
      }
    }, 30000);

    it('extracts date and time via DeepSeek', async () => {
      const hasKey = !!process.env['DEEPSEEK_API_KEY'];
      if (!hasKey) {
        return;
      }

      const result = await llmExtract('Meeting on January 15 2024 at 2:30 PM', [
        { name: 'date', type: 'date', description: 'Meeting date' },
        { name: 'time', type: 'time', description: 'Meeting time' },
      ]);

      expect(result.attempted).toBe(true);
      if (result.values) {
        expect(result.values.date).toBeDefined();
        expect(result.values.time).toBeDefined();
      }
    }, 30000);
  });
});
