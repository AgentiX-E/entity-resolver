/**
 * ILLMAdapter — model-agnostic LLM review interface.
 *
 * Zero hardcoded model behavior. All model-specific logic
 * lives in the LMModels config, not in the pipeline.
 *
 * Design: Strategy pattern. The adapter is a pure transport
 * layer. Prompt building and response parsing are injected
 * via configuration, not embedded in code.
 */

/** A pair submitted for LLM review. */
export interface LMPair {
  readonly leftId: number;
  readonly rightId: number;
  readonly leftText: string;
  readonly rightText: string;
}

/** Binary verdict from an LLM review. */
export interface LMPairVerdict {
  readonly leftId: number;
  readonly rightId: number;
  readonly verdict: 'match' | 'deny';
}

/** Response parser: extracts verdicts from raw LLM output. */
export type LMParseResponse = (
  rawResponse: string,
  pairs: readonly LMPair[],
) => LMPairVerdict[];

/** Prompt builder: constructs the prompt from a batch of pairs. */
export type LMPromptBuilder = (pairs: readonly LMPair[]) => string;

/** Complete LLM model configuration. */
export interface LLMModelConfig {
  /** Human-readable model name (e.g., "deepseek-v4-flash"). */
  readonly name: string;
  /** API endpoint URL. */
  readonly endpoint: string;
  /** Model identifier passed to the API. */
  readonly model: string;
  /** HTTP headers (Authorization, Content-Type). */
  readonly headers: Record<string, string>;
  /** Maximum token budget per API call. */
  readonly maxTokens: number;
  /** Sampling temperature (0 = deterministic). */
  readonly temperature: number;
  /** Pairs per API call. */
  readonly batchSize: number;
  /** Timeout per API call in ms. */
  readonly timeoutMs: number;
  /** Builds the prompt from pairs. Injected, not baked in. */
  readonly buildPrompt: LMPromptBuilder;
  /** Parses the API response into verdicts. Injected, not baked in. */
  readonly parseResponse: LMParseResponse;
}

/** Standard LLM adapter — model-agnostic HTTP transport. */
export interface ILLMAdapter {
  /** Review a batch of pairs, returning binary verdicts. */
  review(pairs: readonly LMPair[]): Promise<LMPairVerdict[]>;
  /** Release resources. */
  dispose(): Promise<void>;
}

// ═══════════════════════ Pre-built Prompt/Parse Factories ═══════════════════════

/**
 * Creates a prompt builder that requests MATCH/NO_MATCH per pair.
 * This format works with DeepSeek, GLM-4, GPT-4o-mini, and most
 * instruction-tuned models when prompted correctly.
 */
export function simpleMatchPrompt(): LMPromptBuilder {
  return (pairs) => {
    let prompt = 'Same product? Answer only MATCH or NO_MATCH per pair:\n\n';
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]!;
      prompt += `${i + 1}. ${p.leftText.slice(0, 55)}\n   ${p.rightText.slice(0, 55)}\n\n`;
    }
    return prompt;
  };
}

/**
 * Creates a few-shot prompt builder — shows expected output format
 * before asking for real verdicts. Better for models that tend to
 * produce verbose output (GLM-4 family).
 */
export function fewShotMatchPrompt(): LMPromptBuilder {
  return (pairs) => {
    // Few-shot examples teach the model the expected format
    let prompt =
      'Same product? Output ONLY "N. MATCH" or "N. NO_MATCH":\n\n' +
      'Example:\n1. Sony PSLX350H | Sony PS-LX350H\n1. MATCH\n' +
      '2. Bose 161 | Boss 161 Speaker\n2. NO_MATCH\n\n' +
      'Real pairs (override examples):\n';
    for (let i = 0; i < pairs.length; i++) {
      prompt += `${i + 1}. ${pairs[i]!.leftText.slice(0, 50)} | ${pairs[i]!.rightText.slice(0, 50)}\n`;
    }
    return prompt;
  };
}

/**
 * Standard response parser: matches "N. MATCH" / "N. NO_MATCH" patterns.
 * Works with both simple and few-shot prompt formats.
 */
export function standardMatchParser(): LMParseResponse {
  return (response, pairs) => {
    const verdicts: LMPairVerdict[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]!;
      const pattern = new RegExp(`${i + 1}[.\\)]\\s*(MATCH|NO_MATCH)`, 'i');
      const match = response.match(pattern);
      if (match) {
        verdicts.push({
          leftId: p.leftId,
          rightId: p.rightId,
          verdict: match[1]!.toUpperCase() === 'MATCH' ? 'match' : 'deny',
        });
      }
    }
    return verdicts;
  };
}

// ═══════════════════════ Built-in Model Configs ════════════════════════════════

/**
 * DeepSeek v4 Flash — best general-purpose, strict format adherence.
 * Uses simple prompt (no few-shot needed — DeepSeek follows instructions).
 */
export function deepSeekV4FlashConfig(apiKey: string): LLMModelConfig {
  return {
    name: 'deepseek-v4-flash',
    buildPrompt: simpleMatchPrompt(),
    parseResponse: standardMatchParser(),
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    maxTokens: 400,
    temperature: 0,
    batchSize: 10,
    timeoutMs: 25000,
  };
}

/**
 * Zhipu GLM-4 — needs few-shot prompting to adhere to format.
 * Standard GLM-4 is better than flash for product matching.
 */
export function glm4Config(apiKey: string): LLMModelConfig {
  return {
    name: 'glm-4',
    buildPrompt: fewShotMatchPrompt(),
    parseResponse: standardMatchParser(),
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-0520',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    maxTokens: 200,
    temperature: 0,
    batchSize: 10,
    timeoutMs: 25000,
  };
}

/**
 * Zhipu GLM-4 Flash — fast/cheap, needs few-shot.
 */
export function glm4FlashConfig(apiKey: string): LLMModelConfig {
  return {
    name: 'glm-4-flash',
    buildPrompt: fewShotMatchPrompt(),
    parseResponse: standardMatchParser(),
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    maxTokens: 200,
    temperature: 0,
    batchSize: 10,
    timeoutMs: 25000,
  };
}
