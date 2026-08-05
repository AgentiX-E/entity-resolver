// ApiEmbeddingProvider — generic REST-API embedding backend.
// Zero coupling to any provider. Strategy-pattern adapters.
import type { IEmbeddingProvider } from '@agentix-e/entity-resolver-core';

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

export class ApiEmbeddingProvider implements IEmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private _endpoint: string;
  private _headers: Record<string, string>;
  private _buildReq: EmbedRequestBuilder;
  private _parseResp: EmbedResponseParser;
  private _maxBatch: number;
  private _timeout: number;
  private _ok = false;

  constructor(cfg: ApiEmbeddingConfig) {
    this.name = cfg.name;
    this.dimensions = cfg.dimensions;
    this._endpoint = cfg.endpoint;
    this._headers = { 'Content-Type': 'application/json', ...cfg.headers };
    this._buildReq = cfg.buildRequest;
    this._parseResp = cfg.parseResponse;
    this._maxBatch = cfg.maxBatchSize ?? 100;
    this._timeout = cfg.timeoutMs ?? 30000;
  }

  async initialize(): Promise<void> { this._ok = true; }

  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    if (!this._ok) await this.initialize();
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += this._maxBatch) {
      const batch = texts.slice(i, i + this._maxBatch);
      const body = JSON.stringify(this._buildReq(batch));
      const json = await this._post(body);
      for (const v of this._parseResp(json)) out.push(v);
    }
    return out;
  }

  private _post(body: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const url = new URL(this._endpoint);
      const mod = url.protocol === 'https:' ? require('node:https') : require('node:http');
      const req = mod.request(url, {
        method: 'POST',
        headers: this._headers,
        timeout: this._timeout,
      }, (res: any) => {
        let data = '';
        res.on('data', (c: Buffer) => data += c.toString());
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
      req.write(body);
      req.end();
    });
  }

  async dispose(): Promise<void> { this._ok = false; }
}

// Pre-built adapters

export function openAICompatibleAdapter(model: string): {
  buildRequest: EmbedRequestBuilder; parseResponse: EmbedResponseParser;
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

export function vertexAIAdapter(): {
  buildRequest: EmbedRequestBuilder; parseResponse: EmbedResponseParser;
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
