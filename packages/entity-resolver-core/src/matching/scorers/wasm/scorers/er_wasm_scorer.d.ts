/* tslint:disable */
/* eslint-disable */

export function wasm_dice(a: string, b: string): number;

export function wasm_jaro(a: string, b: string): number;

export function wasm_jaro_winkler(a: string, b: string, p: number): number;

export function wasm_levenshtein_similarity(a: string, b: string): number;

export function wasm_score(scorer_name: string, a: string, b: string): number;

export function wasm_soundex_match(a: string, b: string): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly wasm_dice: (a: number, b: number, c: number, d: number) => number;
  readonly wasm_jaro: (a: number, b: number, c: number, d: number) => number;
  readonly wasm_jaro_winkler: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly wasm_levenshtein_similarity: (a: number, b: number, c: number, d: number) => number;
  readonly wasm_score: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly wasm_soundex_match: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
