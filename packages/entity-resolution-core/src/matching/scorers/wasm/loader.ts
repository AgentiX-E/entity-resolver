// WASM scorer loader — auto-detects Rust-accelerated scorers.
// Falls back to pure JS scorers when WASM is unavailable.

import type { IScorer } from '../../../interfaces/IScorer.js';

/**
 * Attempt to load WASM-accelerated scorers.
 * Returns null if WASM is unavailable (platform not supported or --no-optional).
 *
 * TODO: Implement when Rust scoring kernels are compiled to WASM (I11).
 */
export async function tryLoadWasmScorers(): Promise<Readonly<Record<string, IScorer>> | null> {
  // Placeholder: WASM compilation happens in I11 (Production)
  // When ready, this will dynamically import the WASM module:
  //   const wasm = await import('./scorers/wasm_scorer.js');
  //   return wasm.createWasmScorers();
  return null;
}
