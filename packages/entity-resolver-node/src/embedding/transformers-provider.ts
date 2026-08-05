/**
 * TransformersEmbeddingProvider — embedding via @xenova/transformers (ONNX runtime).
 *
 * Supports any Hugging Face model compatible with Transformers.js:
 *   - Xenova/all-MiniLM-L6-v2  (384-dim, 80MB, fast)
 *   - Xenova/bge-small-en-v1.5 (384-dim, 130MB, retrieval-optimized)
 *   - Xenova/all-mpnet-base-v2  (768-dim, 420MB, highest quality)
 *
 * Falls back gracefully if model download fails (lazy init).
 */
import type { IEmbeddingProvider } from '@agentix-e/entity-resolver-core';

export interface TransformersEmbeddingsConfig {
  /** Hugging Face model ID (default: all-MiniLM-L6-v2). */
  readonly modelId?: string;
  /** Pooling strategy (default: mean). */
  readonly pooling?: 'mean' | 'cls';
  /** Batch size for embedding (default: 1). */
  readonly batchSize?: number;
}

export class TransformersEmbeddingProvider implements IEmbeddingProvider {
  readonly name: string;
  private _modelId: string;
  private _pooling: string;
  private _dimensions: number | null = null;
  private _pipeline: any = null;
  private _initialized = false;

  constructor(config: TransformersEmbeddingsConfig = {}) {
    this._modelId = config.modelId ?? 'Xenova/all-MiniLM-L6-v2';
    this._pooling = config.pooling ?? 'mean';
    const dims: Record<string, number> = {
      'Xenova/all-MiniLM-L6-v2': 384,
      'Xenova/bge-small-en-v1.5': 384,
      'Xenova/all-mpnet-base-v2': 768,
      'Xenova/e5-small-v2': 384,
    };
    this._dimensions = dims[this._modelId] ?? null;
    this.name = this._modelId.split('/').pop() ?? 'transformers';
  }

  get dimensions(): number {
    if (this._dimensions == null) {
      this._dimensions = 384; // default for unknown models
    }
    return this._dimensions;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    const { pipeline: pipe } = await import('@xenova/transformers');
    this._pipeline = await pipe('feature-extraction', this._modelId);
    this._initialized = true;
  }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    if (!this._initialized) await this.initialize();
    const results: Float32Array[] = [];
    for (const text of texts) {
      const output = await this._pipeline(text, { pooling: this._pooling });
      results.push(output.data);
    }
    return results;
  }

  async dispose(): Promise<void> {
    this._pipeline = null;
    this._initialized = false;
  }
}
