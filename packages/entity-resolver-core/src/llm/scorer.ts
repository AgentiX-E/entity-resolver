// LLM-assisted boundary-pair scorer for entity-resolver.
// Uses an LLM (DeepSeek, OpenAI-compatible) to resolve ambiguous pairs.
// API key is injected via configuration — NEVER in code or environment variables.
//
// Production-hardened with:
// - Circuit breaker: pauses on consecutive failures to prevent API abuse
// - Exponential backoff retry: transient failures (429/500/503) are retried
// - Batch processing: boundary pairs are scored in configurable parallel batches
// - Graceful degradation: circuit-open returns neutral scores, not errors

import type { ScoredPair } from '../types/core.js';
import type { ILogger } from '../interfaces/ILogger.js';

/** LLM provider configuration. */
export interface LLMProviderConfig {
  /** API base URL. Default: DeepSeek API. */
  readonly apiBaseUrl?: string;
  /** Model name. Default: deepseek-v4-pro. */
  readonly model?: string;
  /** API key for the provider. MUST be provided by the caller (never from env). */
  readonly apiKey: string;
  /** Max tokens for LLM response. */
  readonly maxTokens?: number;
  /** Maximum pairs to batch in a single API call. Default: 5. */
  readonly batchSize?: number;
  /** Maximum retry attempts on transient failures. Default: 3. */
  readonly maxRetries?: number;
  /** Base delay for exponential backoff (ms). Default: 1000. */
  readonly retryBaseMs?: number;
  /** Circuit breaker: max consecutive failures before pausing. Default: 5. */
  readonly circuitBreakerThreshold?: number;
  /** Circuit breaker cooldown (ms). Default: 60000. */
  readonly circuitBreakerCooldownMs?: number;
}

/** LLM scorer configuration. */
export interface LLMScorerConfig extends LLMProviderConfig {
  /** Minimum score threshold to consider for LLM review. */
  readonly candidateLo: number;
  /** Maximum score threshold. Pairs in [lo, hi] are sent to LLM. */
  readonly candidateHi: number;
}

/** Result from LLM scoring a record pair. */
export interface LLMScorerResult {
  readonly leftId: number;
  readonly rightId: number;
  readonly originalScore: number;
  readonly llmScore: number;
  readonly reasoning: string;
}

// ═══════════════════════════════════════════════════════════════
// Circuit breaker state (module-level — shared across calls)
// ═══════════════════════════════════════════════════════════════

interface CircuitState {
  consecutiveFailures: number;
  openSince: number | null;
}

const _circuit = new Map<string, CircuitState>();

function getCircuitState(key: string): CircuitState {
  const existing = _circuit.get(key);
  if (existing) return existing;
  const fresh: CircuitState = { consecutiveFailures: 0, openSince: null };
  _circuit.set(key, fresh);
  return fresh;
}

/**
 * Check if the circuit is open (requests should be blocked).
 * Returns true if the circuit breaker has tripped and the cooldown hasn't elapsed.
 */
function isCircuitOpen(state: CircuitState, cooldownMs: number): boolean {
  if (state.openSince === null) return false;
  if (Date.now() - state.openSince >= cooldownMs) {
    // Cooldown elapsed — reset to half-open
    state.openSince = null;
    return false;
  }
  return true;
}

/**
 * Reset the circuit breaker state for testing.
 * @internal Not part of the public API.
 */
export function resetCircuitBreaker(key?: string): void {
  if (key) {
    _circuit.delete(key);
  } else {
    _circuit.clear();
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Score ambiguous boundary pairs using an LLM.
 *
 * Pairs with scores in [candidateLo, candidateHi] are sent to the LLM
 * for semantic judgment. Pairs outside this range are returned as-is.
 *
 * Features:
 * - Circuit breaker: pauses after N consecutive failures
 * - Exponential backoff retry on transient errors (429, 500, 503)
 * - Configurable batch parallelism
 * - Graceful degradation: returns neutral scores when circuit is open
 *
 * The API key MUST be provided via config.apiKey — never read from
 * environment variables or hardcoded.
 */
export async function scoreWithLLM(
  pairs: readonly ScoredPair[],
  records: readonly Record<string, unknown>[],
  config: LLMScorerConfig,
  logger?: ILogger,
): Promise<LLMScorerResult[]> {
  if (!config.apiKey) {
    throw new Error('LLMScorerConfig.apiKey is required for LLM scoring');
  }

  const apiBase = config.apiBaseUrl ?? 'https://api.deepseek.com/v1';
  const model = config.model ?? 'deepseek-v4-pro';
  const batchSize = config.batchSize ?? 5;
  const maxRetries = config.maxRetries ?? 3;
  const retryBaseMs = config.retryBaseMs ?? 1000;
  const cbThreshold = config.circuitBreakerThreshold ?? 5;
  const cbCooldownMs = config.circuitBreakerCooldownMs ?? 60000;

  // Filter to boundary pairs only
  const boundaryPairs = pairs.filter((p) => {
    const score = p.probability ?? p.score;
    return score >= config.candidateLo && score <= config.candidateHi;
  });

  if (boundaryPairs.length === 0) return [];

  // Circuit breaker check
  const circuitKey = `${apiBase}:${model}`;
  const circuit = getCircuitState(circuitKey);

  if (isCircuitOpen(circuit, cbCooldownMs)) {
    logger?.warn('LLM scorer circuit breaker is open — returning neutral scores', {
      operation: 'scoreWithLLM',
      circuitKey,
      consecutiveFailures: circuit.consecutiveFailures,
    });
    // Graceful degradation: return neutral scores for all boundary pairs
    return boundaryPairs.map((pair) => ({
      leftId: pair.leftId,
      rightId: pair.rightId,
      originalScore: pair.probability ?? pair.score,
      llmScore: 0.5,
      reasoning: 'circuit breaker open — LLM unavailable',
    }));
  }

  const sharedState: SharedState = {
    apiBase,
    apiKey: config.apiKey,
    model,
    maxTokens: config.maxTokens ?? 200,
    maxRetries,
    retryBaseMs,
    circuit,
    cbThreshold,
    cbCooldownMs,
    ...(logger !== undefined ? { logger } : {}),
  };

  // Process boundary pairs in batches
  const results: LLMScorerResult[] = [];
  const batches = chunkArray(boundaryPairs, batchSize);

  for (const batch of batches) {
    if (isCircuitOpen(circuit, cbCooldownMs)) {
      // Circuit opened mid-processing — add neutral scores for remaining pairs
      for (const pair of batch) {
        results.push({
          leftId: pair.leftId,
          rightId: pair.rightId,
          originalScore: pair.probability ?? pair.score,
          llmScore: 0.5,
          reasoning: 'circuit breaker opened during processing',
        });
      }
      continue;
    }

    // Score batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map((pair) => {
        const recordA = records[pair.leftId] ?? {};
        const recordB = records[pair.rightId] ?? {};
        const prompt = buildComparisonPrompt(recordA, recordB);
        return callLLMWithRetry(prompt, sharedState);
      }),
    );

    for (let i = 0; i < batch.length; i++) {
      const pair = batch[i]!;
      const settled = batchResults[i]!;

      if (settled.status === 'fulfilled') {
        const llmResult = settled.value;
        results.push({
          leftId: pair.leftId,
          rightId: pair.rightId,
          originalScore: pair.probability ?? pair.score,
          llmScore: llmResult.score,
          reasoning: llmResult.reasoning,
        });
        // Success resets circuit
        circuit.consecutiveFailures = 0;
        circuit.openSince = null;
      } else {
        // Failure increments circuit
        circuit.consecutiveFailures++;
        if (circuit.consecutiveFailures >= cbThreshold) {
          circuit.openSince = Date.now();
          logger?.warn('LLM scorer circuit breaker tripped', {
            operation: 'scoreWithLLM',
            circuitKey,
            consecutiveFailures: circuit.consecutiveFailures,
          });
        }
        // Return neutral score for failed pair
        results.push({
          leftId: pair.leftId,
          rightId: pair.rightId,
          originalScore: pair.probability ?? pair.score,
          llmScore: 0.5,
          reasoning: `LLM error: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`,
        });
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

interface SharedState {
  apiBase: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  maxRetries: number;
  retryBaseMs: number;
  circuit: CircuitState;
  cbThreshold: number;
  cbCooldownMs: number;
  logger?: ILogger;
}

/**
 * Call the LLM API with exponential backoff retry.
 * Retries on transient errors: 429 (rate limit), 500, 502, 503.
 */
async function callLLMWithRetry(
  prompt: string,
  state: SharedState,
): Promise<{ score: number; reasoning: string }> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= state.maxRetries; attempt++) {
    try {
      return await callLLM(
        state.apiBase,
        state.apiKey,
        state.model,
        prompt,
        state.maxTokens,
        state.logger,
      );
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on auth errors (401, 403)
      if (isAuthError(err)) throw lastError;

      // Don't retry on last attempt
      if (attempt >= state.maxRetries) throw lastError;

      // Exponential backoff
      const delay = state.retryBaseMs * Math.pow(2, attempt);
      state.logger?.warn(
        `LLM API call failed (attempt ${attempt + 1}/${state.maxRetries + 1}), retrying in ${delay}ms`,
        { operation: 'callLLMWithRetry', cause: lastError.message },
      );
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('LLM API call failed with no error captured');
}

/** Check if an error is an authentication error (not retryable). */
function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    return msg.includes(' 401') || msg.includes(' 403');
  }
  return false;
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Split an array into chunks of the given size. */
function chunkArray<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Build a comparison prompt for the LLM. */
function buildComparisonPrompt(a: Record<string, unknown>, b: Record<string, unknown>): string {
  const fieldsA = Object.entries(a)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join('\n');

  const fieldsB = Object.entries(b)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join('\n');

  return `Determine if these two records refer to the same real-world entity.
Respond with a JSON object: {"score": <0-1>, "reasoning": "<brief>"}

Record A:
${fieldsA}

Record B:
${fieldsB}

Are these the same entity? Score: 1 = definitely same, 0 = definitely different.`;
}

/** Call the LLM API and parse the response. */
async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number,
  logger?: ILogger,
): Promise<{ score: number; reasoning: string }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an entity resolver assistant. Respond only with valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = data.choices[0]?.message?.content ?? '{"score":0.5,"reasoning":"no response"}';

  try {
    const jsonStr = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr) as { score: number; reasoning: string };
    return {
      score: Math.max(0, Math.min(1, parsed.score)),
      reasoning: parsed.reasoning ?? 'no reasoning provided',
    };
  } catch {
    logger?.warn(
      'LLM JSON response parse failed — returning neutral score as graceful degradation',
    );
    return { score: 0.5, reasoning: 'failed to parse LLM response' };
  }
}
