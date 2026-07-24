// WASM scorer loader — now with real Rust-compiled WASM!
// Auto-detects and loads WASM-accelerated scorers.
// Falls back to pure JS when WASM is unavailable.

import type { IScorer } from '../../../interfaces/IScorer.js';
import type { ILogger } from '../../../interfaces/ILogger.js';
import type { FieldMetadata } from '../../../types/core.js';

let _wasmScorers: Readonly<Record<string, IScorer>> | null = null;

/**
 * Attempt to load WASM-accelerated scorers.
 * Returns null if WASM is unavailable.
 */
export async function tryLoadWasmScorers(logger?: ILogger): Promise<Readonly<Record<string, IScorer>> | null> {
  if (_wasmScorers) return _wasmScorers;

  try {
    // Dynamically import the compiled WASM module
    const wasm = await import('./scorers/wasm_scorer.js');

    const wasmScore = wasm.wasm_score as (name: string, a: string, b: string) => number;

    const scorers: Record<string, IScorer> = {};

    const names = ['levenshtein', 'jaro', 'jaro_winkler', 'dice', 'soundex'];

    for (const name of names) {
      scorers[name] = {
        name,
        kernelized: true,
        score(a: unknown, b: unknown, _field: FieldMetadata): number {
          return wasmScore(name, String(a ?? ''), String(b ?? ''));
        },
      };
    }

    _wasmScorers = scorers;
    return _wasmScorers;
  } catch (err: unknown) {
    logger?.warn(
      `WASM scorer loading failed — falling back to pure JS scorers: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
