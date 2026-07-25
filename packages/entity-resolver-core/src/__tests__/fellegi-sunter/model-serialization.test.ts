// Tests for model serialization — round-trip integrity, versioning, and validation.

import { describe, it, expect } from 'vitest';
import {
  serializeModel,
  serializeFSParamsToJSON,
  deserializeModel,
  deserializeFSParamsFromJSON,
  MODEL_VERSION,
  estimateParameters,
} from '../../index.js';
import type { EMResult } from '../../index.js';
import type { ComparisonSpec } from '../../matching/comparison.js';
import type { BlockingConfig } from '../../blocking/types.js';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function makeSampleEMResult(): EMResult {
  const vectors = [
    [{ field: 'name', level: 'exact_match', score: 1, scorer: 'exact' }],
    [{ field: 'name', level: 'exact_match', score: 1, scorer: 'exact' }],
    [{ field: 'name', level: 'not_match', score: 0.1, scorer: 'jw' }],
    [{ field: 'name', level: 'not_match', score: 0.1, scorer: 'jw' }],
  ];
  return estimateParameters(vectors);
}

const sampleComparisons: ComparisonSpec[] = [
  {
    field: 'name',
    scorerName: 'jaro_winkler',
    levels: [
      { label: 'exact_match', threshold: 0.99 },
      { label: 'strong_match', threshold: 0.85 },
    ],
  },
];

const sampleBlocking: BlockingConfig = {
  passes: [{ fields: ['name'], transforms: ['lowercase', 'strip'] }],
};

// ═══════════════════════════════════════════════════════════════
// Serialization Round-Trip
// ═══════════════════════════════════════════════════════════════

describe('serializeModel / deserializeModel', () => {
  it('S1: round-trip preserves lambda', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const result = deserializeModel(json);

    expect(result.valid).toBe(true);
    expect(result.model!.parameters.lambda).toBe(em.parameters.lambda);
  });

  it('S2: round-trip preserves m-probability keys', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const result = deserializeModel(json);

    for (const [key, m] of em.parameters.mProbabilities) {
      expect(result.model!.parameters.mProbabilities[key]).toBe(m);
    }
  });

  it('S3: round-trip preserves u-probability keys', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const result = deserializeModel(json);

    for (const [key, u] of em.parameters.uProbabilities) {
      expect(result.model!.parameters.uProbabilities[key]).toBe(u);
    }
  });

  it('S4: serialized model has version and timestamp', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const result = deserializeModel(json);

    expect(result.model!.version).toBe(MODEL_VERSION);
    expect(result.model!.serializedAt).toBeTruthy();
    expect(new Date(result.model!.serializedAt).getTime()).toBeGreaterThan(0);
  });

  it('S5: serialized model preserves comparisons', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const result = deserializeModel(json);

    expect(result.model!.comparisons).toHaveLength(1);
    expect(result.model!.comparisons[0]!.field).toBe('name');
    expect(result.model!.comparisons[0]!.scorerName).toBe('jaro_winkler');
  });

  it('S6: serialized model preserves blocking config', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const result = deserializeModel(json);

    expect(result.model!.blocking.passes).toHaveLength(1);
    expect(result.model!.blocking.passes[0]!.fields).toEqual(['name']);
  });

  it('S7: serialized model preserves match threshold', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.73);
    const result = deserializeModel(json);

    expect(result.model!.matchThreshold).toBe(0.73);
  });

  it('S8: round-trip is lossless for all numeric parameters', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const result = deserializeModel(json);

    expect(result.model!.parameters.lambda).toBeCloseTo(em.parameters.lambda, 10);
    for (const [key, m] of em.parameters.mProbabilities) {
      expect(result.model!.parameters.mProbabilities[key]!).toBeCloseTo(m, 10);
    }
    for (const [key, u] of em.parameters.uProbabilities) {
      expect(result.model!.parameters.uProbabilities[key]!).toBeCloseTo(u, 10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// FS Parameters Serialization
// ═══════════════════════════════════════════════════════════════

describe('serializeFSParamsToJSON / deserializeFSParamsFromJSON', () => {
  it('F1: lightweight round-trip', () => {
    const em = makeSampleEMResult();
    const json = serializeFSParamsToJSON(em.parameters);
    const params = deserializeFSParamsFromJSON(json);

    expect(params.lambda).toBe(em.parameters.lambda);
    for (const [key, m] of em.parameters.mProbabilities) {
      expect(params.mProbabilities.get(key)).toBe(m);
    }
    for (const [key, u] of em.parameters.uProbabilities) {
      expect(params.uProbabilities.get(key)).toBe(u);
    }
  });

  it('F2: deserialized params pass validation', () => {
    const em = makeSampleEMResult();
    const json = serializeFSParamsToJSON(em.parameters);
    // Should not throw
    const params = deserializeFSParamsFromJSON(json);
    expect(params.lambda).toBeGreaterThan(0);
    expect(params.lambda).toBeLessThan(1);
  });

  it('F3: rejects invalid JSON', () => {
    expect(() => deserializeFSParamsFromJSON('not json')).toThrow();
  });

  it('F4: rejects missing fields', () => {
    expect(() => deserializeFSParamsFromJSON('{}')).toThrow();
  });

  it('F5: rejects invalid lambda', () => {
    expect(() =>
      deserializeFSParamsFromJSON(
        JSON.stringify({ lambda: 5, mProbabilities: {}, uProbabilities: {} }),
      ),
    ).toThrow();
  });

  it('F6: rejects out-of-range m-probability', () => {
    expect(() =>
      deserializeFSParamsFromJSON(
        JSON.stringify({
          lambda: 0.5,
          mProbabilities: { 'name:exact_match': 2 },
          uProbabilities: { 'name:exact_match': 0.1 },
        }),
      ),
    ).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Validation Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('deserializeModel validation', () => {
  it('V1: rejects non-JSON input', () => {
    const result = deserializeModel('not valid json at all');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('V2: rejects null', () => {
    const result = deserializeModel('null');
    expect(result.valid).toBe(false);
  });

  it('V3: rejects missing parameters', () => {
    const result = deserializeModel(
      JSON.stringify({
        version: '1.0',
        comparisons: [],
        blocking: { passes: [] },
        matchThreshold: 0.5,
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('parameters'))).toBe(true);
  });

  it('V4: rejects missing comparisons', () => {
    const result = deserializeModel(
      JSON.stringify({
        version: '1.0',
        parameters: { lambda: 0.5, mProbabilities: {}, uProbabilities: {} },
        blocking: { passes: [] },
        matchThreshold: 0.5,
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('V5: rejects missing blocking', () => {
    const result = deserializeModel(
      JSON.stringify({
        version: '1.0',
        parameters: { lambda: 0.5, mProbabilities: {}, uProbabilities: {} },
        comparisons: [],
        matchThreshold: 0.5,
      }),
    );
    expect(result.valid).toBe(false);
  });

  it('V6: rejects invalid match threshold', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const modified = JSON.parse(json) as Record<string, unknown>;
    modified.matchThreshold = 5;
    const result = deserializeModel(JSON.stringify(modified));
    expect(result.valid).toBe(false);
  });

  it('V7: rejects invalid comparison spec', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const modified = JSON.parse(json) as Record<string, unknown>;
    (modified.comparisons as Record<string, unknown>[])[0] = { bad: 'spec' };
    const result = deserializeModel(JSON.stringify(modified));
    expect(result.valid).toBe(false);
  });

  it('V8: rejects invalid level in comparison', () => {
    const em = makeSampleEMResult();
    const json = serializeModel(em, sampleComparisons, sampleBlocking, 0.5);
    const modified = JSON.parse(json) as Record<string, unknown>;
    const comps = modified.comparisons as Record<string, unknown>[];
    (comps[0]!.levels as Record<string, unknown>[])[0] = { x: 1 };
    const result = deserializeModel(JSON.stringify(modified));
    expect(result.valid).toBe(false);
  });
});

describe('Deserialization error edge cases', () => {
  it('handles invalid JSON string', () => {
    const result = deserializeModel('not valid json{{{');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles empty object JSON', () => {
    const result = deserializeModel('{}');
    expect(result.valid).toBe(false);
  });

  it('handles null serialization', () => {
    const result = deserializeModel('null');
    expect(result.valid).toBe(false);
  });

  it('deserializeFSParamsFromJSON handles empty', () => {
    expect(() => {
      deserializeFSParamsFromJSON(JSON.stringify({ m: [], u: [] }));
    }).toThrow();
  });
});
