// Tests for ComparisonSpec, ComparisonVector, and comparison levels.

import { describe, it, expect } from 'vitest';
import {
  generateComparisonVectors,
  COMPARISON_LEVELS,
  nameComparisonSpec,
  emailComparisonSpec,
  dateComparisonSpec,
} from '../index.js';
import type { FieldMetadata } from '../types/core.js';

const TEST_META = new Map<string, FieldMetadata>([
  ['name', { name: 'name', semanticType: 'name', cardinality: 100, isNumeric: false }],
  ['email', { name: 'email', semanticType: 'email', cardinality: 200, isNumeric: false }],
  ['dob', { name: 'dob', semanticType: 'date', cardinality: 300, isNumeric: false }],
]);

describe('ComparisonLevels', () => {
  it('COMPARISON_LEVELS has standard levels', () => {
    expect(COMPARISON_LEVELS.EXACT_MATCH.threshold).toBe(0.99);
    expect(COMPARISON_LEVELS.STRONG_MATCH.threshold).toBe(0.85);
    expect(COMPARISON_LEVELS.MODERATE_MATCH.threshold).toBe(0.7);
    expect(COMPARISON_LEVELS.WEAK_MATCH.threshold).toBe(0.5);
  });
});

describe('nameComparisonSpec', () => {
  it('generates a proper name spec', () => {
    const spec = nameComparisonSpec('name');
    expect(spec.field).toBe('name');
    expect(spec.scorerName).toBe('jaro_winkler');
    expect(spec.levels.length).toBe(4);
  });
});

describe('emailComparisonSpec', () => {
  it('generates a proper email spec', () => {
    const spec = emailComparisonSpec('email');
    expect(spec.field).toBe('email');
    expect(spec.scorerName).toBe('exact');
    expect(spec.levels.length).toBe(1);
  });
});

describe('dateComparisonSpec', () => {
  it('generates a proper date spec', () => {
    const spec = dateComparisonSpec('dob');
    expect(spec.field).toBe('dob');
    expect(spec.scorerName).toBe('date_diff');
    expect(spec.levels.length).toBe(3);
  });
});

describe('generateComparisonVectors', () => {
  it('generates vectors for matching records', () => {
    const specs = [nameComparisonSpec('name')];
    const vectors = generateComparisonVectors(
      { name: 'John Smith' },
      { name: 'John Smith' },
      specs,
      TEST_META,
    );
    expect(vectors.length).toBe(1);
    expect(vectors[0]!.level).toBe('exact_match');
    expect(vectors[0]!.score).toBe(1);
  });

  it('generates vectors for non-matching records', () => {
    const specs = [nameComparisonSpec('name')];
    const vectors = generateComparisonVectors(
      { name: 'John Smith' },
      { name: 'Mary Jones' },
      specs,
      TEST_META,
    );
    expect(vectors.length).toBe(1);
    expect(vectors[0]!.level).toBe('not_match');
  });

  it('handles multiple specs', () => {
    const specs = [nameComparisonSpec('name'), emailComparisonSpec('email')];
    const vectors = generateComparisonVectors(
      { name: 'John Smith', email: 'john@example.com' },
      { name: 'Jon Smith', email: 'john@example.com' },
      specs,
      TEST_META,
    );
    expect(vectors.length).toBe(2);
    expect(vectors[1]!.level).toBe('exact_match'); // email matches exactly
  });

  it('handles missing fields gracefully', () => {
    const specs = [nameComparisonSpec('nonexistent')];
    const vectors = generateComparisonVectors({}, {}, specs, TEST_META);
    expect(vectors.length).toBe(1);
    expect(vectors[0]!.score).toBeGreaterThanOrEqual(0);
    expect(vectors[0]!.score).toBeLessThanOrEqual(1);
  });
});
