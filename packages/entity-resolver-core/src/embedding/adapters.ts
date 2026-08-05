/**
 * Shared embedding adapter types and helpers (platform-agnostic).
 * Used by both node and browser embedding providers.
 */
export type EmbedRequestBuilder = (texts: readonly string[]) => Record<string, unknown>;
export type EmbedResponseParser = (json: Record<string, unknown>) => Float32Array[];

export interface ApiEmbeddingConfig {
  readonly name: string;
  readonly endpoint: string;
  readonly dimensions: number;
  readonly headers: Record<string, string>;
  readonly buildRequest: EmbedRequestBuilder;
  readonly parseResponse: EmbedResponseParser;
  readonly maxBatchSize?: number;
  readonly timeoutMs?: number;
}

/** OpenAI-compatible adapter (works with Zhipu GLM, DeepSeek, OpenAI). */
export function openAICompatibleAdapter(model: string): {
  buildRequest: EmbedRequestBuilder;
  parseResponse: EmbedResponseParser;
} {
  return {
    buildRequest: (texts) => ({ model, input: texts }),
    parseResponse: (json) => {
      const data = (json as any).data as Array<{ embedding: number[] }>;
      if (!Array.isArray(data)) throw new Error('Missing data[].embedding');
      return data.map((d) => new Float32Array(d.embedding));
    },
  };
}

/** Vertex AI adapter. */
export function vertexAIAdapter(): {
  buildRequest: EmbedRequestBuilder;
  parseResponse: EmbedResponseParser;
} {
  return {
    buildRequest: (texts) => ({ instances: texts.map((t) => ({ content: t })) }),
    parseResponse: (json) => {
      const p = (json as any).predictions as Array<{ embeddings: { values: number[] } }>;
      if (!Array.isArray(p)) throw new Error('Missing predictions');
      return p.map((d) => new Float32Array(d.embeddings.values));
    },
  };
}
