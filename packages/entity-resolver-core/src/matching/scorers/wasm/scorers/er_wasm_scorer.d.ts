/* tslint:disable */
/* eslint-disable */

export function wasm_dice(a: string, b: string): number;

export function wasm_ensemble(a: string, b: string): number;

export function wasm_jaro(a: string, b: string): number;

export function wasm_jaro_winkler(a: string, b: string, p: number): number;

export function wasm_levenshtein_similarity(a: string, b: string): number;

export function wasm_score(scorer_name: string, a: string, b: string): number;

export function wasm_soundex_match(a: string, b: string): number;
