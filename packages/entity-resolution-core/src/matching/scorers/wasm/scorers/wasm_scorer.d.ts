// Type declarations for the WASM scorer module.
// Built via `wasm-pack build --target web` from rust-scorer/.

/** Initialize the WASM module. */
export default function init(): Promise<void>;

/** Dispatch a scoring call to the WASM-accelerated scorer.
 *  @param name - scorer name (levenshtein, jaro, jaro_winkler, dice, soundex)
 *  @param a    - first string
 *  @param b    - second string
 *  @returns similarity score in [0, 1]
 */
export function wasm_score(name: string, a: string, b: string): number;
