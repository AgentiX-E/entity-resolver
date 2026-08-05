// WASM scorer loader — direct wasm-bindgen module access
import type { IScorer } from '../../../interfaces/IScorer.js';
import type { ILogger } from '../../../interfaces/ILogger.js';
import type { FieldMetadata } from '../../../types/core.js';

let _wasmScorers: Readonly<Record<string, IScorer>> | null = null;

export async function tryLoadWasmScorers(
  logger?: ILogger,
): Promise<Readonly<Record<string, IScorer>> | null> {
  if (_wasmScorers) return _wasmScorers;

  try {
    // Direct import of wasm-bindgen output (nodejs target)
    const wasm = await import('./scorers/er_wasm_scorer.js');

    // Map scorer names to their wasm functions
    const fnMap: Record<string, (a: string, b: string) => number> = {
      levenshtein: (a,b) => wasm.wasm_levenshtein_similarity(a,b),
      jaro: (a,b) => wasm.wasm_jaro(a,b),
      jaro_winkler: (a,b) => wasm.wasm_jaro_winkler(a,b,0.1),
      dice: (a,b) => wasm.wasm_dice(a,b),
      soundex: (a,b) => wasm.wasm_soundex_match(a,b),
      ensemble: (a,b) => wasm.wasm_ensemble(a,b),
    };

    const scorers: Record<string, IScorer> = {};
    for (const [name, fn] of Object.entries(fnMap)) {
      scorers[name] = {
        name,
        kernelized: true,
        score(a: unknown, b: unknown, _field: FieldMetadata): number {
          return fn(String(a), String(b));
        },
      };
    }

    _wasmScorers = scorers;
    return _wasmScorers;
  } catch (err: unknown) {
    logger?.warn(`WASM scorer load failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
