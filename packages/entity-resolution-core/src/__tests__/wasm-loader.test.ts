import { describe, it, expect } from 'vitest';
import { tryLoadWasmScorers } from '../index.js';

describe('WASM loader (placeholder)', () => {
  it('returns null when WASM is unavailable (placeholder)', async () => {
    const result = await tryLoadWasmScorers();
    expect(result).toBeNull();
  });
});
