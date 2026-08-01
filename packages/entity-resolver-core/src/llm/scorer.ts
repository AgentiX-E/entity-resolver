// LLM-assisted boundary-pair scorer for entity-resolver.
// Supports DeepSeek, OpenAI, Anthropic, Ollama, and custom OpenAI-compatible providers.
// API key is injected via configuration — NEVER in code or environment variables.
//
import { LLMError } from '../errors/hierarchy.js';
// Production-hardened with:
// - Multi-provider: DeepSeek, OpenAI, Anthropic, Ollama, custom
// - Two-stage hybrid: cheap scorer → top-K LLM reranking
// - Circuit breaker: pauses on consecutive failures to prevent API abuse
// - Exponential backoff retry: transient failures (429/500/503) are retried
// - Batch processing: boundary pairs are scored in configurable parallel batches
// - Cost tracking: per-call token usage and estimated USD cost
// - Graceful degradation: circuit-open returns neutral scores, not errors

import type { ScoredPair } from '../types/core.js';
import type { ILogger } from '../interfaces/ILogger.js';

// ═══════════════════════════════════════════════════════════════
// Provider abstraction
// ═══════════════════════════════════════════════════════════════

/** Supported LLM providers. */
export type LLMProvider = 'deepseek' | 'openai' | 'anthropic' | 'ollama' | 'custom';

/** Provider-specific defaults. */
interface ProviderDefaults {
  readonly baseUrl: string;
  readonly model: string;
  readonly inputPricePer1M: number;
  readonly outputPricePer1M: number;
}

const PROVIDER_DEFAULTS: Readonly<Record<LLMProvider, ProviderDefaults>> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-pro',
    inputPricePer1M: 0.14,
    outputPricePer1M: 0.28,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.60,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-haiku-20240307',
    inputPricePer1M: 0.25,
    outputPricePer1M: 1.25,
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1:8b',
    inputPricePer1M: 0,
    outputPricePer1M: 0,
  },
  custom: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-pro',
    inputPricePer1M: 0.14,
    outputPricePer1M: 0.28,
  },
};

/** LLM provider configuration. */
export interface LLMProviderConfig {
  /** LLM provider. Default: deepseek. */
  readonly provider?: LLMProvider;
  /** API base URL. Auto-selected per provider if not set. */
  readonly apiBaseUrl?: string;
  /** Model name. Auto-selected per provider if not set. */
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

/** LLM hybrid (two-stage) configuration. */
export interface LLMHybridConfig extends LLMScorerConfig {
  /** Top-K pairs to send to LLM for reranking. Default: 20. */
  readonly topK?: number;
  /** Minimum original score to qualify for LLM review. Default: 0.3. */
  readonly minCandidateScore?: number;
}

/** Cost estimation for an LLM scoring run. */
export interface LLMCostEstimate {
  readonly estimatedPromptTokens: number;
  readonly estimatedCompletionTokens: number;
  readonly estimatedCostUSD: number;
}

/** Per-pair cost tracking in results. */
export interface LLMCostBreakdown {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUSD: number;
}

/** Result from LLM scoring a record pair. */
export interface LLMScorerResult {
  readonly leftId: number;
  readonly rightId: number;
  readonly originalScore: number;
  readonly llmScore: number;
  readonly reasoning: string;
  /** Cost breakdown for this specific pair (if token usage was reported). */
  readonly cost?: LLMCostBreakdown;
}

/** Internal LLM response with optional token usage. */
interface LLMResponse {
  score: number;
  reasoning: string;
  usage?: { promptTokens: number; completionTokens: number };
}

// ═══════════════════════════════════════════════════════════════
// Provider resolution
// ═══════════════════════════════════════════════════════════════

function resolveProvider(config: LLMProviderConfig): {
  apiBase: string;
  model: string;
  provider: LLMProvider;
} {
  const provider = config.provider ?? 'deepseek';
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    apiBase: config.apiBaseUrl ?? defaults.baseUrl,
    model: config.model ?? defaults.model,
    provider,
  };
}

// ═══════════════════════════════════════════════════════════════
// Cost estimation
// ═══════════════════════════════════════════════════════════════

/** Average tokens per field (empirical: ~4 tokens per field name + value). */
const TOKENS_PER_FIELD = 8;

/**
 * Estimate LLM cost before making API calls.
 * Useful for budgeting and cost-aware decision making.
 *
 * @param pairCount — Number of record pairs to score
 * @param averageFieldsPerRecord — Average number of fields per record
 * @param provider — LLM provider for pricing
 */
export function estimateLLMCost(
  pairCount: number,
  averageFieldsPerRecord: number,
  provider: LLMProvider = 'deepseek',
): LLMCostEstimate {
  const defaults = PROVIDER_DEFAULTS[provider];
  // Prompt: system + instructions + 2 records × fields
  const promptTokens = pairCount * (50 + 2 * averageFieldsPerRecord * TOKENS_PER_FIELD);
  // Completion: ~20 tokens per pair for JSON response
  const completionTokens = pairCount * 20;

  const inputCost = (promptTokens / 1_000_000) * defaults.inputPricePer1M;
  const outputCost = (completionTokens / 1_000_000) * defaults.outputPricePer1M;

  return {
    estimatedPromptTokens: promptTokens,
    estimatedCompletionTokens: completionTokens,
    estimatedCostUSD: Math.round((inputCost + outputCost) * 1e6) / 1e6,
  };
}

function computeCost(
  promptTokens: number,
  completionTokens: number,
  provider: LLMProvider,
): number {
  const defaults = PROVIDER_DEFAULTS[provider];
  const inputCost = (promptTokens / 1_000_000) * defaults.inputPricePer1M;
  const outputCost = (completionTokens / 1_000_000) * defaults.outputPricePer1M;
  return Math.round((inputCost + outputCost) * 1e6) / 1e6;
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
    throw new LLMError('LLMScorerConfig.apiKey is required for LLM scoring');
  }

  const { apiBase, model, provider } = resolveProvider(config);
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
    provider,
    maxTokens: config.maxTokens ?? 200,
    maxRetries,
    retryBaseMs,
    circuit,
    cbThreshold,
    cbCooldownMs,
    ...(logger !== undefined ? { logger } : {}),
  };

  return processBatches(boundaryPairs, records, sharedState);
}

/**
 * Two-stage hybrid LLM scoring for cost-optimal entity resolution.
 *
 * Stage 1 (cheap): Sort pairs by existing string similarity, keep top-K.
 * Stage 2 (LLM): Send only the top-K boundary pairs to LLM for semantic reranking.
 *
 * This reduces LLM API costs by 10-100x compared to sending all pairs,
 * while maintaining high accuracy on the most ambiguous cases.
 *
 * Pairs below minCandidateScore receive their original score unchanged.
 */
export async function scoreWithLLMHybrid(
  pairs: readonly ScoredPair[],
  records: readonly Record<string, unknown>[],
  config: LLMHybridConfig,
  logger?: ILogger,
): Promise<LLMScorerResult[]> {
  if (!config.apiKey) {
    throw new LLMError('LLMHybridConfig.apiKey is required for LLM hybrid scoring');
  }

  const topK = config.topK ?? 20;
  const minScore = config.minCandidateScore ?? 0.3;

  // Stage 1: Sort by original score, keep top-K candidates
  const scoredWithIndex = pairs.map((p, i) => ({
    pair: p,
    idx: i,
    score: p.probability ?? p.score,
  }));
  scoredWithIndex.sort((a, b) => b.score - a.score);

  const candidates = scoredWithIndex
    .filter((s) => s.score >= minScore)
    .slice(0, topK);

  if (candidates.length === 0) {
    // No candidates qualify — return original pairs unchanged
    return pairs.map((pair) => ({
      leftId: pair.leftId,
      rightId: pair.rightId,
      originalScore: pair.probability ?? pair.score,
      llmScore: pair.probability ?? pair.score,
      reasoning: 'no candidates qualified for LLM review',
    }));
  }

  logger?.info('LLM hybrid: selected top-K candidates for reranking', {
    operation: 'scoreWithLLMHybrid',
    totalPairs: pairs.length,
    candidates: candidates.length,
    topK,
    minScore,
  });

  // Stage 2: Send candidates to LLM
  const candidatePairs = candidates.map((c) => c.pair);
  const llmResults = await scoreWithLLM(candidatePairs, records, config, logger);

  // Merge: LLM-scored pairs get LLM results, rest get original scores
  const llmMap = new Map<string, LLMScorerResult>();
  for (const r of llmResults) {
    llmMap.set(`${r.leftId}:${r.rightId}`, r);
  }

  return pairs.map((pair) => {
    const key = `${pair.leftId}:${pair.rightId}`;
    const llmResult = llmMap.get(key);
    if (llmResult) return llmResult;
    return {
      leftId: pair.leftId,
      rightId: pair.rightId,
      originalScore: pair.probability ?? pair.score,
      llmScore: pair.probability ?? pair.score,
      reasoning: 'below LLM review threshold',
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// Batch processing
// ═══════════════════════════════════════════════════════════════

async function processBatches(
  boundaryPairs: ScoredPair[],
  records: readonly Record<string, unknown>[],
  state: SharedState,
): Promise<LLMScorerResult[]> {
  const results: LLMScorerResult[] = [];
  const batches = chunkArray(boundaryPairs, 5);

  for (const batch of batches) {
    if (isCircuitOpen(state.circuit, state.cbCooldownMs)) {
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

    const batchResults = await Promise.allSettled(
      batch.map((pair) => {
        const recordA = records[pair.leftId] ?? {};
        const recordB = records[pair.rightId] ?? {};
        const prompt = buildComparisonPrompt(recordA, recordB);
        return callLLMWithRetry(prompt, state);
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
          ...(llmResult.usage && {
            cost: {
              promptTokens: llmResult.usage.promptTokens,
              completionTokens: llmResult.usage.completionTokens,
              costUSD: computeCost(
                llmResult.usage.promptTokens,
                llmResult.usage.completionTokens,
                state.provider,
              ),
            },
          }),
        });
        state.circuit.consecutiveFailures = 0;
        state.circuit.openSince = null;
      } else {
        state.circuit.consecutiveFailures++;
        if (state.circuit.consecutiveFailures >= state.cbThreshold) {
          state.circuit.openSince = Date.now();
          state.logger?.warn('LLM scorer circuit breaker tripped', {
            operation: 'scoreWithLLM',
            circuitKey: `${state.apiBase}:${state.model}`,
            consecutiveFailures: state.circuit.consecutiveFailures,
          });
        }
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
  provider: LLMProvider;
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
): Promise<LLMResponse> {
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
): Promise<LLMResponse> {
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
    throw new LLMError(`LLM API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const content = data.choices[0]?.message?.content ?? '{"score":0.5,"reasoning":"no response"}';

  const usage = data.usage
    ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
    : undefined;

  try {
    const jsonStr = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr) as { score: number; reasoning: string };
    return {
      score: Math.max(0, Math.min(1, parsed.score)),
      reasoning: parsed.reasoning ?? 'no reasoning provided',
      ...(usage && { usage }),
    };
  } catch {
    logger?.warn(
      'LLM JSON response parse failed — returning neutral score as graceful degradation',
    );
    return { score: 0.5, reasoning: 'failed to parse LLM response', ...(usage && { usage }) };
  }
}
