/* @ts-self-types="./er_wasm_scorer.d.ts" */
import * as wasm from "./er_wasm_scorer_bg.wasm";
import { __wbg_set_wasm } from "./er_wasm_scorer_bg.js";

__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    wasm_dice, wasm_ensemble, wasm_jaro, wasm_jaro_winkler, wasm_levenshtein_similarity, wasm_score, wasm_soundex_match
} from "./er_wasm_scorer_bg.js";
