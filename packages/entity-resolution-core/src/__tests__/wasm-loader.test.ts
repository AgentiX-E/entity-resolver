// Tests for WASM loader (now with real compiled WASM).

import { describe, it, expect } from 'vitest';
import { tryLoadWasmScorers } from '../index.js';

describe('WASM loader', () => {
  it('loads WASM scorers successfully', async () => {
    const scorers = await tryLoadWasmScorers();
    expect(scorers).not.toBeNull();
    expect(Object.keys(scorers!).length).toBe(5);
  });

  it('WASM levenshtein matches JS output', async () => {
    const scorers = await tryLoadWasmScorers();
    const wasm = scorers!.levenshtein!;
    expect(wasm.score('kitten', 'sitting', { name: 'test', semanticType: 'string', cardinality: 1, isNumeric: false })).toBeGreaterThan(0.5);
    // Identical strings should return 1
    expect(wasm.score('abc', 'abc', { name: 'test', semanticType: 'string', cardinality: 1, isNumeric: false })).toBe(1);
  });

  it('WASM jaro-winkler verified against known values', async () => {
    const scorers = await tryLoadWasmScorers();
    const jw = scorers!.jaro_winkler!;
    const score = jw.score('MARTHA', 'MARHTA', { name: 'test', semanticType: 'string', cardinality: 1, isNumeric: false });
    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeCloseTo(0.961, 2);
  });

  it('WASM soundex matches homophones', async () => {
    const scorers = await tryLoadWasmScorers();
    const sx = scorers!.soundex!;
    expect(sx.score('Robert', 'Rupert', { name: 'test', semanticType: 'string', cardinality: 1, isNumeric: false })).toBe(1);
    expect(sx.score('Robert', 'Michael', { name: 'test', semanticType: 'string', cardinality: 1, isNumeric: false })).toBe(0);
  });

  it('all 5 WASM scorers return [0, 1]', async () => {
    const scorers = await tryLoadWasmScorers();
    for (const [, scorer] of Object.entries(scorers!)) {
      const score = scorer.score('hello', 'world', { name: 't', semanticType: 'string', cardinality: 1, isNumeric: false });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
