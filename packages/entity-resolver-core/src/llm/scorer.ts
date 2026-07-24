// LLM-assisted boundary-pair scorer for entity-resolver.
// Uses an LLM (DeepSeek, OpenAI-compatible) to resolve ambiguous pairs.
// API key is injected via configuration — NEVER in code or environment variables.

import type { ScoredPair } from '../types/core.js';
import type { ILogger } from '../interfaces/ILogger.js';

/** LLM provider configuration. */
export interface LLMProviderConfig {
  /** API base URL. Default: DeepSeek API. */
  readonly apiBaseUrl?: string;
  /** Model name. Default: deepseek-chat. */
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

/**
 * Score ambiguous boundary pairs using an LLM.
 *
 * Pairs with scores in [candidateLo, candidateHi] are sent to the LLM
 * for semantic judgment. Pairs outside this range are returned as-is.
 *
 * The API key MUST be provided via config.apiKey — never read from
 * environment variables or hardcoded. This ensures the caller controls
 * credential lifecycle and injection (e.g., from a secret manager).
 */
export async function scoreWithLLM(
  pairs: readonly ScoredPair[],
  records: ReadonlyArray<Record<string, unknown>>,
  config: LLMScorerConfig,
  logger?: ILogger,
): Promise<LLMScorerResult[]> {
  if (!config.apiKey) {
    throw new Error('LLMScorerConfig.apiKey is required for LLM scoring');
  }

  const results: LLMScorerResult[] = [];
  const apiBase = config.apiBaseUrl ?? 'https://api.deepseek.com/v1';
  const model = config.model ?? 'deepseek-chat';

  for (const pair of pairs) {
    const score = pair.probability ?? pair.score;

    // Only send boundary pairs to LLM
    if (score < config.candidateLo || score > config.candidateHi) continue;

    const recordA = records[pair.leftId] ?? {};
    const recordB = records[pair.rightId] ?? {};

    const prompt = buildComparisonPrompt(recordA, recordB);
    const llmResult = await callLLM(apiBase, config.apiKey, model, prompt, config.maxTokens ?? 200, logger);

    results.push({
      leftId: pair.leftId,
      rightId: pair.rightId,
      originalScore: score,
      llmScore: llmResult.score,
      reasoning: llmResult.reasoning,
    });
  }

  return results;
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
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices[0]?.message?.content ?? '{"score":0.5,"reasoning":"no response"}';

  try {
    // Parse JSON from response (may contain markdown code fences)
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
    logger?.warn('LLM JSON response parse failed — returning neutral score as graceful degradation');
    return { score: 0.5, reasoning: 'failed to parse LLM response' };
  }
}
