// LLM-assisted boundary-pair scorer for entity-resolver.
// Uses an LLM (DeepSeek, OpenAI-compatible) to resolve ambiguous pairs.
// API key via DEEPSEEK_API_KEY environment variable — NEVER in code.

import type { ScoredPair } from '../types/core.js';

/** LLM scorer configuration. */
export interface LLMScorerConfig {
  /** Minimum score threshold to consider for LLM review. */
  readonly candidateLo: number;
  /** Maximum score threshold. Pairs in [lo, hi] are sent to LLM. */
  readonly candidateHi: number;
  /** API base URL. Default: DeepSeek API. */
  readonly apiBaseUrl?: string;
  /** Model name. Default: deepseek-chat. */
  readonly model?: string;
  /** Max tokens for LLM response. */
  readonly maxTokens?: number;
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
 * API key: Set DEEPSEEK_API_KEY environment variable.
 * NEVER hardcode API keys in source code.
 */
export async function scoreWithLLM(
  pairs: readonly ScoredPair[],
  records: ReadonlyArray<Record<string, unknown>>,
  config: LLMScorerConfig,
): Promise<LLMScorerResult[]> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is required for LLM scoring');
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
    const llmResult = await callLLM(apiBase, apiKey, model, prompt, config.maxTokens ?? 200);

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
    return { score: 0.5, reasoning: 'failed to parse LLM response' };
  }
}
