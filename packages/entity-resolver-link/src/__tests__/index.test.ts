import { describe, it, expect } from 'vitest';
import { linkVersion } from '../index.js';

describe('entity-resolver-link skeleton', () => {
  it('exports version string matching semver', () => {
    expect(linkVersion).toBeTypeOf('string');
    expect(linkVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exports LinkResult interface (type-level check)', () => {
    // Type-level verification — the interface is compile-time only.
    const dummy: Record<string, unknown> = {
      entityId: 'ent_001',
      candidates: [{ entityId: 'ent_001', score: 0.95 }],
      matchTier: 'exact',
      confidence: 0.95,
    };
    expect(dummy.entityId).toBeDefined();
    expect(dummy.candidates).toBeInstanceOf(Array);
    expect(dummy.matchTier).toBe('exact');
    expect(dummy.confidence).toBeTypeOf('number');
  });
});
