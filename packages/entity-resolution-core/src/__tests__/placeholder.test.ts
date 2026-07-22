import { describe, it, expect } from 'vitest';
import { IMPLEMENTED_SCORER_COUNT } from '../index.js';

describe('entity-resolution-core', () => {
  it('should export the expected number of scorers', () => {
    expect(IMPLEMENTED_SCORER_COUNT).toBe(19);
  });
});
