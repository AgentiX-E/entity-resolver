// WASM scorer loader — now with real Rust-compiled WASM!
// Auto-detects and loads WASM-accelerated scorers.
// Falls back to pure JS when WASM is unavailable.

import type { IScorer } from '../../../interfaces/IScorer.js';
import type { FieldMetadata } from '../../../types/core.js';

let _wasmScorers: Readonly<Record<string, IScorer>> | null = null;

/**
 * Attempt to load WASM-accelerated scorers.
 * Returns null if WASM is unavailable.
 */
export async function tryLoadWasmScorers(): Promise<Readonly<Record<string, IScorer>> | null> {
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
  } catch {
    return null;
  }
}
