// LLMAdapter — config-driven HTTP transport for ILLMAdapter
import type { ILLMAdapter, LLMModelConfig, LMPair, LMPairVerdict } from '@agentix-e/entity-resolver-core';

export type { ILLMAdapter, LLMModelConfig, LMPair, LMPairVerdict };
export { simpleMatchPrompt, fewShotMatchPrompt, standardMatchParser, deepSeekV4FlashConfig, glm4Config, glm4FlashConfig } from '@agentix-e/entity-resolver-core';

export class LLMAdapter implements ILLMAdapter {
  private _config: LLMModelConfig;

  constructor(config: LLMModelConfig) { this._config = config; }

  async review(pairs: readonly LMPair[]): Promise<LMPairVerdict[]> {
    const out: LMPairVerdict[] = [];
    for (let i = 0; i < pairs.length; i += this._config.batchSize) {
      const batch = pairs.slice(i, i + this._config.batchSize);
      const prompt = this._config.buildPrompt(batch);
      const raw = await this._post(prompt);
      for (const v of this._config.parseResponse(raw, batch)) out.push(v);
    }
    return out;
  }

  private async _post(prompt: string): Promise<string> {
    try {
      const res = await fetch(this._config.endpoint, {
        method: 'POST', headers: this._config.headers,
        body: JSON.stringify({ model: this._config.model, messages: [{ role: 'user', content: prompt }], max_tokens: this._config.maxTokens, temperature: this._config.temperature }),
        signal: AbortSignal.timeout(this._config.timeoutMs),
      });
      if (!res.ok) return '';
      const data = await res.json() as any;
      return data.choices?.[0]?.message?.content ?? '';
    } catch { return ''; }
  }

  async dispose(): Promise<void> {}
}
