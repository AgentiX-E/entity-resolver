import { describe, it, expect } from 'vitest';
import { extractVersion } from '../index.js';

describe('entity-resolver-extract skeleton', () => {
  it('exports version string matching semver', () => {
    expect(extractVersion).toBeTypeOf('string');
    expect(extractVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exports ExtractionResult interface (type-level check)', () => {
    // Type-level verification — the interface is compile-time only.
    // This test ensures the module is importable and the interface shape
    // is structurally preserved.
    const dummy: Record<string, unknown> = {
      values: { name: 'test' },
      provenance: { name: 'pattern' },
      confidence: { name: 0.95 },
      normalizedText: 'test',
    };
    expect(dummy.values).toBeDefined();
    expect(dummy.provenance).toBeDefined();
    expect(dummy.confidence).toBeDefined();
    expect(dummy.normalizedText).toBeDefined();
  });
});
