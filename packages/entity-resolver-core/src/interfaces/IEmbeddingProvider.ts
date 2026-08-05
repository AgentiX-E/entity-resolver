/**
 * IEmbeddingProvider — Pluggable embedding abstraction.
 *
 * Enables swappable embedding backends (Transformers.js, ONNX, API)
 * without coupling to any specific model or runtime.
 *
 * Design principle: core defines the contract — platform packages
 * provide the engine. Consistent with ISqlBackend, IDataSource, etc.
 */
export interface IEmbeddingProvider {
  /** Unique identifier for this provider (e.g., "minilm", "bge", "vertex-ai"). */
  readonly name: string;
  /** Output dimension of the embedding vectors. */
  readonly dimensions: number;
  /** One-time initialization (model loading, API key validation). */
  initialize(): Promise<void>;
  /** Generate embeddings for a batch of texts. */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
  /** Release resources (model unload, connection close). */
  dispose(): Promise<void>;
}
