// WASM bridge — delegates to compiled Rust WASM via wasm-bindgen.
// Initializes the WASM module synchronously on import.

import { initSync, wasm_score } from './er_wasm_scorer.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmBytes = readFileSync(join(__dirname, 'er_wasm_scorer_bg.wasm'));
initSync({ module: wasmBytes });

// Re-export wasm_score and a default init (no-op — already initialized)
export default async function init() { /* already initialized synchronously */ }
export { wasm_score };
