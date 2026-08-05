/**
 * BrowserApiEmbeddingProvider — generic REST-API embedding via fetch().
 *
 * Zero coupling to any provider. Adapters (openAICompatible, vertexAI)
 * are shared with node package via @agentix-e/entity-resolver-core.
 */
import type { IEmbeddingProvider } from '@agentix-e/entity-resolver-core';
import type { ApiEmbeddingConfig } from '@agentix-e/entity-resolver-core';

export type { ApiEmbeddingConfig };
export { openAICompatibleAdapter, vertexAIAdapter } from '@agentix-e/entity-resolver-core';

export class BrowserApiEmbeddingProvider implements IEmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private _cfg: ApiEmbeddingConfig;
  private _ok = false;

  constructor(cfg: ApiEmbeddingConfig) {
    this.name = cfg.name;
    this.dimensions = cfg.dimensions;
    this._cfg = cfg;
  }

  async initialize(): Promise<void> { this._ok = true; }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    if (!this._ok) await this.initialize();
    const out: Float32Array[] = [];
    const maxBatch = this._cfg.maxBatchSize ?? 100;
    const timeout = this._cfg.timeoutMs ?? 30000;

    for (let i = 0; i < texts.length; i += maxBatch) {
      const batch = texts.slice(i, i + maxBatch);
      const body = JSON.stringify(this._cfg.buildRequest(batch));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(this._cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this._cfg.headers },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      const json = await res.json() as Record<string, unknown>;
      for (const v of this._cfg.parseResponse(json)) out.push(v);
    }

    return out;
  }

  async dispose(): Promise<void> { this._ok = false; }
}
