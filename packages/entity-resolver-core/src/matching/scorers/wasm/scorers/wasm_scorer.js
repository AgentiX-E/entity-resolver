// Placeholder WASM bridge — built via `cargo build --target wasm32-unknown-unknown`
// and post-processed with wasm-bindgen / wasm-pack.
// This file is replaced by the CI build pipeline.

let _wasmInstance: WebAssembly.Instance | null = null;

export async function default(): Promise<void> {
  // In production, loads the compiled .wasm binary
}

export function wasm_score(name: string, a: string, b: string): number {
  // Fallback: WASM not loaded
  throw new Error('WASM module not loaded — use JS fallback scorers');
}
