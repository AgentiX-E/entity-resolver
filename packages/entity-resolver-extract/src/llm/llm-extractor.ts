/**
 * LLM Extractor — Schema-driven entity extraction via LLM.
 *
 * Implements Layer 3 of the extraction cascade (Pattern → ONNX → LLM).
 * Uses DeepSeek API (OpenAI-compatible) with Instructor-style validation:
 *   1. Build extraction prompt with JSON Schema
 *   2. Call LLM for extraction
 *   3. Parse and validate JSON response
 *   4. Coerce values to target types
 *   5. Retry on validation failure (up to 3 attempts)
 *
 * Features:
 *   - Exponential backoff retry (1s, 2s, 4s)
 *   - Circuit breaker: after N consecutive failures, pause for 30s
 *   - Graceful degradation: no API key → empty result (no error)
 *   - Rate limit handling: HTTP 429 → wait and retry
 *
 * API key is read from process.env.DEEPSEEK_API_KEY only.
 * Never hardcoded in source code.
 */

import type { FieldDescriptor } from '../extractor.js';
import { buildExtractionPrompt, parseLLMResponse } from './prompt-builder.js';
import type { PromptInput } from './prompt-builder.js';
import { coerce } from '../normalization/type-coercion.js';
import type { CoercionTarget } from '../normalization/type-coercion.js';

// ─── Configuration ───────────────────────────────────────────────────

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000; // 1s base
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000; // 30s
const REQUEST_TIMEOUT_MS = 15_000; // 15s

// ─── Circuit breaker state ───────────────────────────────────────────

interface CircuitState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

let circuitState: CircuitState = {
  failures: 0,
  lastFailureTime: 0,
  isOpen: false,
};

function resetCircuitBreaker(): void {
  circuitState = { failures: 0, lastFailureTime: 0, isOpen: false };
}

function recordFailure(): void {
  circuitState.failures++;
  circuitState.lastFailureTime = Date.now();
  if (circuitState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitState.isOpen = true;
  }
}

function checkCircuitBreaker(): boolean {
  if (!circuitState.isOpen) return false;

  // Check if cooldown has elapsed
  const elapsed = Date.now() - circuitState.lastFailureTime;
  if (elapsed >= CIRCUIT_BREAKER_COOLDOWN_MS) {
    // Reset and allow retry
    circuitState.isOpen = false;
    circuitState.failures = 0;
    return false;
  }
  return true;
}

// ─── Public API ──────────────────────────────────────────────────────

export interface LLMExtractOptions {
  /** Override API key (default: process.env.DEEPSEEK_API_KEY) */
  apiKey?: string;
  /** Override API URL (default: DeepSeek) */
  apiUrl?: string;
  /** Model name (default: deepseek-chat) */
  model?: string;
  /** Maximum retries (default: 3) */
  maxRetries?: number;
}

export interface LLMExtractResult {
  /** Whether the LLM extraction was attempted (vs skipped) */
  attempted: boolean;
  /** Extracted values (null if skipped or failed) */
  values: Record<string, unknown> | null;
  /** Per-field confidence [0, 1] — LLM results get 0.60-0.85 */
  confidence: number;
  /** Error message if extraction failed */
  error?: string;
}

/**
 * Reset circuit breaker state (useful for testing).
 */
export function resetLLMCircuitBreaker(): void {
  resetCircuitBreaker();
}

/**
 * Get current circuit breaker state (for diagnostics/testing).
 */
export function getCircuitBreakerState(): CircuitState {
  return { ...circuitState };
}

/**
 * Extract entities using LLM (DeepSeek).
 *
 * This is Layer 3 of the cascade. Call only when Pattern (Layer 1)
 * and ONNX (Layer 2) have failed to extract required fields.
 *
 * @param text - Normalized text to extract from
 * @param fields - Field descriptors
 * @param options - LLM configuration
 * @returns LLMExtractResult with values or error
 */
export async function llmExtract(
  text: string,
  fields: FieldDescriptor[],
  options: LLMExtractOptions = {},
): Promise<LLMExtractResult> {
  const apiKey = options.apiKey ?? getApiKey();

  // Graceful degradation: no API key → skip
  if (!apiKey) {
    return {
      attempted: false,
      values: null,
      confidence: 0,
    };
  }

  // Circuit breaker check
  if (checkCircuitBreaker()) {
    return {
      attempted: true,
      values: null,
      confidence: 0,
      error: 'Circuit breaker open — too many consecutive failures',
    };
  }

  // Build prompt
  const promptInput: PromptInput = { text, fields };
  const prompt = buildExtractionPrompt(promptInput);

  const maxRetries = options.maxRetries ?? MAX_RETRIES;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await callDeepSeek(
        prompt.systemMessage,
        prompt.userMessage,
        apiKey,
        options.apiUrl ?? DEEPSEEK_API_URL,
        options.model ?? 'deepseek-chat',
      );

      const parsed = parseLLMResponse(response);
      if (!parsed) {
        // Failed to parse JSON — retry
        if (attempt < maxRetries - 1) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        }
        continue;
      }

      // Coerce extracted values to target types
      const values: Record<string, unknown> = {};
      let allValid = true;

      for (const field of fields) {
        const rawValue = parsed[field.name];
        if (rawValue === null || rawValue === undefined) {
          values[field.name] = undefined;
          continue;
        }

        const coerced = coerce(rawValue, field.type as CoercionTarget);
        if (coerced.success) {
          values[field.name] = coerced.value;
        } else {
          allValid = false;
          values[field.name] = undefined;
        }
      }

      // If all required fields have values, we succeeded
      const requiredFields = fields.filter((f) => f.required);
      const requiredFilled = requiredFields.every((f) => values[f.name] !== undefined);

      if (allValid && requiredFilled) {
        // Success — reset circuit breaker on any success
        resetCircuitBreaker();
        return {
          attempted: true,
          values,
          confidence: 0.75, // LLM results have moderate baseline confidence
        };
      }

      // Some fields failed validation — retry
      if (attempt < maxRetries - 1) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    } catch (err) {
      recordFailure();

      const message = err instanceof Error ? err.message : String(err);

      // Rate limit — wait and retry
      if (message.includes('429') || message.includes('rate')) {
        if (attempt < maxRetries - 1) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt + 1)); // longer wait
          resetCircuitBreaker(); // rate limit is not a permanent failure
        }
        continue;
      }

      // Non-retriable on last attempt
      if (attempt >= maxRetries - 1) {
        return {
          attempted: true,
          values: null,
          confidence: 0,
          error: message,
        };
      }

      await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
    }
  }

  // All retries exhausted
  return {
    attempted: true,
    values: null,
    confidence: 0,
    error: 'All extraction attempts failed',
  };
}

// ─── Internal helpers ────────────────────────────────────────────────

function getApiKey(): string | undefined {
  // Only from environment — never hardcoded
  return process.env['DEEPSEEK_API_KEY'] ?? undefined;
}

async function callDeepSeek(
  systemMessage: string,
  userMessage: string,
  apiKey: string,
  apiUrl: string,
  model: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty LLM response');
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
