import { describe, it, expect } from 'vitest';
import { extract, PatternRegistry } from '../extractor.js';
import type { FieldDescriptor } from '../extractor.js';

// ── Golden Set — 100 known cases across all 8 field types ─────────────
//
// Each test case verifies that extract() correctly matches the target field
// and returns the expected value with provenance 'pattern'.
//
// The golden set is intentionally diverse:
//   - 15 email tests (various formats, edge cases)
//   - 10 phone tests (international, CJK, edge cases)
//   - 10 URL tests
//   - 15 number tests (integer, float, currency, percentage, scientific)
//   - 10 integer tests
//   - 12 boolean tests (multi-language)
//   - 15 date tests (ISO, slash, named months)
//   - 13 time tests (12h, 24h, edge cases)
//   = 100 total cases

interface GoldenCase {
  text: string;
  field: FieldDescriptor;
  expectedValue: unknown;
  expectedProvenance: 'pattern' | 'onnx' | 'llm';
  minConfidence?: number;
}

const goldenCases: GoldenCase[] = [
  // ── Email (15 cases) ──────────────────────────────────────────────────
  { text: 'Email me at user@domain.com', field: { name: 'e', type: 'email' }, expectedValue: 'user@domain.com', expectedProvenance: 'pattern', minConfidence: 0.9 },
  { text: 'Contact: JOHN.DOE@COMPANY.COM', field: { name: 'e', type: 'email' }, expectedValue: 'john.doe@company.com', expectedProvenance: 'pattern' },
  { text: 'send to user+tag@domain.co.uk', field: { name: 'e', type: 'email' }, expectedValue: 'user+tag@domain.co.uk', expectedProvenance: 'pattern' },
  { text: 'please contact a@b.io soon', field: { name: 'e', type: 'email' }, expectedValue: 'a@b.io', expectedProvenance: 'pattern' },
  { text: 'Email: first.last@sub.domain.org', field: { name: 'e', type: 'email' }, expectedValue: 'first.last@sub.domain.org', expectedProvenance: 'pattern' },
  { text: 'support@123.com is our address', field: { name: 'e', type: 'email' }, expectedValue: 'support@123.com', expectedProvenance: 'pattern' },
  { text: 'my_email_2024@gmail.com', field: { name: 'e', type: 'email' }, expectedValue: 'my_email_2024@gmail.com', expectedProvenance: 'pattern' },
  { text: 'no-email@here', field: { name: 'e', type: 'email' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'username@localhost', field: { name: 'e', type: 'email' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'no spaces@domain.com', field: { name: 'e', type: 'email' }, expectedValue: 'spaces@domain.com', expectedProvenance: 'pattern' },
  { text: '<admin@site.com> brackets around', field: { name: 'e', type: 'email' }, expectedValue: 'admin@site.com', expectedProvenance: 'pattern' },
  { text: 'Contact info@business.dev', field: { name: 'e', type: 'email' }, expectedValue: 'info@business.dev', expectedProvenance: 'pattern' },
  { text: 'Email address: hello.world@long.tld.name', field: { name: 'e', type: 'email' }, expectedValue: 'hello.world@long.tld.name', expectedProvenance: 'pattern' },
  { text: 'plain text no at sign', field: { name: 'e', type: 'email' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'valid_email@valid-domain.com works', field: { name: 'e', type: 'email' }, expectedValue: 'valid_email@valid-domain.com', expectedProvenance: 'pattern' },

  // ── Phone (10 cases) ──────────────────────────────────────────────────
  { text: 'Call +86-138-0000-0000', field: { name: 'p', type: 'phone' }, expectedValue: '+86-138-0000-0000', expectedProvenance: 'pattern' },
  { text: 'Office: (010) 1234-5678', field: { name: 'p', type: 'phone' }, expectedValue: '(010) 1234-5678', expectedProvenance: 'pattern' },
  { text: 'Dial 13800000000 now', field: { name: 'p', type: 'phone' }, expectedValue: '13800000000', expectedProvenance: 'pattern' },
  { text: '1-800-555-0199 for support', field: { name: 'p', type: 'phone' }, expectedValue: '1-800-555-0199', expectedProvenance: 'pattern' },
  { text: '+44 20 7946 0958', field: { name: 'p', type: 'phone' }, expectedValue: '+44 20 7946 0958', expectedProvenance: 'pattern' },
  { text: 'Call 123', field: { name: 'p', type: 'phone' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'no phone numbers here', field: { name: 'p', type: 'phone' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: '0755-12345678 ext 123', field: { name: 'p', type: 'phone' }, expectedValue: '0755-12345678', expectedProvenance: 'pattern' },
  { text: 'Mobile: 13912345678', field: { name: 'p', type: 'phone' }, expectedValue: '13912345678', expectedProvenance: 'pattern' },
  { text: 'Tel 021-1234-5678', field: { name: 'p', type: 'phone' }, expectedValue: '021-1234-5678', expectedProvenance: 'pattern' },

  // ── URL (10 cases) ────────────────────────────────────────────────────
  { text: 'Visit https://example.com', field: { name: 'u', type: 'url' }, expectedValue: 'https://example.com', expectedProvenance: 'pattern' },
  { text: 'Go to www.site.org/path', field: { name: 'u', type: 'url' }, expectedValue: 'https://www.site.org/path', expectedProvenance: 'pattern' },
  { text: 'api.github.com/repos', field: { name: 'u', type: 'url' }, expectedValue: 'https://api.github.com/repos', expectedProvenance: 'pattern' },
  { text: 'Check http://old.example.net', field: { name: 'u', type: 'url' }, expectedValue: 'http://old.example.net', expectedProvenance: 'pattern' },
  { text: 'just regular words', field: { name: 'u', type: 'url' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'domain.com is a site', field: { name: 'u', type: 'url' }, expectedValue: 'https://domain.com', expectedProvenance: 'pattern' },
  { text: 'https://a.b?x=1&y=2', field: { name: 'u', type: 'url' }, expectedValue: 'https://a.b?x=1&y=2', expectedProvenance: 'pattern' },
  { text: 'docs.example.com/guide#intro', field: { name: 'u', type: 'url' }, expectedValue: 'https://docs.example.com/guide#intro', expectedProvenance: 'pattern' },
  { text: 'no url', field: { name: 'u', type: 'url' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'https://x.y.z', field: { name: 'u', type: 'url' }, expectedValue: 'https://x.y.z', expectedProvenance: 'pattern' },

  // ── Number (15 cases) ─────────────────────────────────────────────────
  { text: 'Count is 42', field: { name: 'n', type: 'number' }, expectedValue: 42, expectedProvenance: 'pattern' },
  { text: 'Pi is 3.14', field: { name: 'n', type: 'number' }, expectedValue: 3.14, expectedProvenance: 'pattern' },
  { text: 'Temperature: -10°C', field: { name: 'n', type: 'number' }, expectedValue: -10, expectedProvenance: 'pattern' },
  { text: 'Population 1,234,567', field: { name: 'n', type: 'number' }, expectedValue: 1234567, expectedProvenance: 'pattern' },
  { text: '25% off', field: { name: 'n', type: 'number' }, expectedValue: 0.25, expectedProvenance: 'pattern' },
  { text: 'Cost: $99.99', field: { name: 'n', type: 'number' }, expectedValue: 99.99, expectedProvenance: 'pattern' },
  { text: 'Speed 1.5e10 m/s', field: { name: 'n', type: 'number' }, expectedValue: 1.5e10, expectedProvenance: 'pattern' },
  { text: 'No numbers here', field: { name: 'n', type: 'number' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: '0.001 is small', field: { name: 'n', type: 'number' }, expectedValue: 0.001, expectedProvenance: 'pattern' },
  { text: 'Score: 100%', field: { name: 'n', type: 'number' }, expectedValue: 1.0, expectedProvenance: 'pattern' },
  { text: '+5 offset', field: { name: 'n', type: 'number' }, expectedValue: 5, expectedProvenance: 'pattern' },
  { text: '¥2000', field: { name: 'n', type: 'number' }, expectedValue: 2000, expectedProvenance: 'pattern' },
  { text: '2.5 million', field: { name: 'n', type: 'number' }, expectedValue: 2.5, expectedProvenance: 'pattern' },
  { text: '0 is the minimum', field: { name: 'n', type: 'number' }, expectedValue: 0, expectedProvenance: 'pattern' },
  { text: 'very large 9999999999', field: { name: 'n', type: 'number' }, expectedValue: 9999999999, expectedProvenance: 'pattern' },

  // ── Integer (10 cases) ────────────────────────────────────────────────
  { text: 'There are 100 items', field: { name: 'i', type: 'integer' }, expectedValue: 100, expectedProvenance: 'pattern' },
  { text: 'Count: -50', field: { name: 'i', type: 'integer' }, expectedValue: -50, expectedProvenance: 'pattern' },
  { text: 'Total 1000 rows', field: { name: 'i', type: 'integer' }, expectedValue: 1000, expectedProvenance: 'pattern' },
  { text: 'No integer', field: { name: 'i', type: 'integer' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'value = 0', field: { name: 'i', type: 'integer' }, expectedValue: 0, expectedProvenance: 'pattern' },
  { text: 'ID: 42', field: { name: 'i', type: 'integer' }, expectedValue: 42, expectedProvenance: 'pattern' },
  { text: 'Size: 2,048', field: { name: 'i', type: 'integer' }, expectedValue: 2048, expectedProvenance: 'pattern' },
  { text: 'page 1 of 10', field: { name: 'i', type: 'integer' }, expectedValue: 1, expectedProvenance: 'pattern' },
  { text: 'only floats 3.14', field: { name: 'i', type: 'integer' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'Rank: #5', field: { name: 'i', type: 'integer' }, expectedValue: 5, expectedProvenance: 'pattern' },

  // ── Boolean (12 cases) ────────────────────────────────────────────────
  { text: 'value is true', field: { name: 'b', type: 'boolean' }, expectedValue: true, expectedProvenance: 'pattern' },
  { text: 'value is false', field: { name: 'b', type: 'boolean' }, expectedValue: false, expectedProvenance: 'pattern' },
  { text: 'answer: yes', field: { name: 'b', type: 'boolean' }, expectedValue: true, expectedProvenance: 'pattern' },
  { text: 'answer: no', field: { name: 'b', type: 'boolean' }, expectedValue: false, expectedProvenance: 'pattern' },
  { text: 'Results: 是', field: { name: 'b', type: 'boolean' }, expectedValue: true, expectedProvenance: 'pattern' },
  { text: 'Results: 否', field: { name: 'b', type: 'boolean' }, expectedValue: false, expectedProvenance: 'pattern' },
  { text: 'flag: 1', field: { name: 'b', type: 'boolean' }, expectedValue: true, expectedProvenance: 'pattern' },
  { text: 'flag: 0', field: { name: 'b', type: 'boolean' }, expectedValue: false, expectedProvenance: 'pattern' },
  { text: 'Switch on', field: { name: 'b', type: 'boolean' }, expectedValue: true, expectedProvenance: 'pattern' },
  { text: 'Switch off', field: { name: 'b', type: 'boolean' }, expectedValue: false, expectedProvenance: 'pattern' },
  { text: 'maybe', field: { name: 'b', type: 'boolean' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'Chinese: 对', field: { name: 'b', type: 'boolean' }, expectedValue: true, expectedProvenance: 'pattern' },

  // ── Date (15 cases) ───────────────────────────────────────────────────
  { text: 'Date: 2024-01-15', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Due 2024/03/20', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Jan 15 2024', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Not a date', field: { name: 'd', type: 'date' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: '2024-12-31T23:59:59', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Birthday: July 4, 2024', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'March 15, 2024 is the date', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: '2000-01-01 was Y2K', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'No dates', field: { name: 'd', type: 'date' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: '2024-06-15 event', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Recorded: 2023/11/30', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Dec 25 2024 Christmas', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Feb 29 2024 leap year', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'September 1, 2024', field: { name: 'd', type: 'date' }, expectedValue: null, expectedProvenance: 'pattern', minConfidence: 0.8 },
  { text: 'Hello World', field: { name: 'd', type: 'date' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },

  // ── Time (13 cases) ───────────────────────────────────────────────────
  { text: 'Meeting at 14:30', field: { name: 't', type: 'time' }, expectedValue: '14:30:00', expectedProvenance: 'pattern' },
  { text: 'Wake at 7:30 AM', field: { name: 't', type: 'time' }, expectedValue: '07:30:00', expectedProvenance: 'pattern' },
  { text: 'Dinner at 7:30 PM', field: { name: 't', type: 'time' }, expectedValue: '19:30:00', expectedProvenance: 'pattern' },
  { text: 'Time: 23:59:59', field: { name: 't', type: 'time' }, expectedValue: '23:59:59', expectedProvenance: 'pattern' },
  { text: 'Noon at 12 PM', field: { name: 't', type: 'time' }, expectedValue: '12:00:00', expectedProvenance: 'pattern' },
  { text: 'Midnight at 12 AM', field: { name: 't', type: 'time' }, expectedValue: '00:00:00', expectedProvenance: 'pattern' },
  { text: 'invalid 99:99', field: { name: 't', type: 'time' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: 'no time', field: { name: 't', type: 'time' }, expectedValue: undefined, expectedProvenance: 'pattern', minConfidence: 0 },
  { text: '3:00 PM afternoon', field: { name: 't', type: 'time' }, expectedValue: '15:00:00', expectedProvenance: 'pattern' },
  { text: '9:15 AM sharp', field: { name: 't', type: 'time' }, expectedValue: '09:15:00', expectedProvenance: 'pattern' },
  { text: 'timestamp 14:30:45', field: { name: 't', type: 'time' }, expectedValue: '14:30:45', expectedProvenance: 'pattern' },
  { text: 'lunch at 12', field: { name: 't', type: 'time' }, expectedValue: '12:00:00', expectedProvenance: 'pattern' },
  { text: 'closing at 5pm', field: { name: 't', type: 'time' }, expectedValue: '17:00:00', expectedProvenance: 'pattern' },
];

// ── Test runner ──────────────────────────────────────────────────────

describe('extract() golden set', () => {
  goldenCases.forEach(({ text, field, expectedValue, expectedProvenance, minConfidence }, index) => {
    it(`case ${index + 1}: extracts "${field.type}" from "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`, () => {
      const result = extract(text, [field]);

      expect(result).toBeDefined();
      expect(result.normalizedText).toBeTypeOf('string');

      const value = result.values[field.name];
      const provenance = result.provenance[field.name];
      const confidence = result.confidence[field.name];

      // Provenance check
      expect(provenance).toBe(expectedProvenance);

      // Value check
      if (expectedValue === undefined) {
        // Expected no match
        expect(value).toBeUndefined();
        expect(confidence).toBe(0);
      } else if (expectedValue === null) {
        // Expected a match of some sort (not undefined) but value varies (Date)
        expect(value).toBeDefined();
        expect(value).not.toBeNull();
        expect(confidence).toBeGreaterThan(0);
      } else {
        // Exact value match
        expect(value, `Field "${field.name}" value mismatch`).toEqual(expectedValue);
      }

      // Confidence check (when specified)
      if (minConfidence !== undefined) {
        if (minConfidence > 0) {
          expect(confidence, `Confidence too low for case ${index + 1}`).toBeGreaterThanOrEqual(minConfidence);
        } else {
          expect(confidence).toBe(0);
        }
      }
    });
  });
});

// ── Multi-field extraction ───────────────────────────────────────────

describe('extract() multi-field', () => {
  it('extracts multiple different fields from one text', () => {
    const result = extract(
      'Contact user@example.com or call +86-138-0000-0000 and visit https://example.com',
      [
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'phone' },
        { name: 'website', type: 'url' },
      ],
    );

    expect(result.values.email).toBe('user@example.com');
    expect(result.values.phone).toContain('+86');
    expect(result.values.website).toBe('https://example.com');

    expect(result.provenance.email).toBe('pattern');
    expect(result.provenance.phone).toBe('pattern');
    expect(result.provenance.website).toBe('pattern');
  });

  it('handles partial matches gracefully', () => {
    const result = extract(
      'Send email to john@doe.com',
      [
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'phone' }, // won't match
      ],
    );

    expect(result.values.email).toBe('john@doe.com');
    expect(result.values.phone).toBeUndefined();
    expect(result.provenance.phone).toBe('pattern');
    expect(result.confidence.phone).toBe(0);
  });

  it('returns correct confidence values', () => {
    const result = extract(
      'Price: $99.99, valid: true',
      [
        { name: 'price', type: 'number' },
        { name: 'valid', type: 'boolean' },
      ],
    );

    expect(result.values.price).toBe(99.99);
    expect(result.values.valid).toBe(true);
    expect(result.confidence.price).toBeGreaterThan(0.8);
    expect(result.confidence.valid).toBeGreaterThan(0.8);
  });

  it('normalizes text before extraction', () => {
    const result = extract(
      '  Email: User@Example.COM  ',
      [{ name: 'e', type: 'email' }],
    );

    expect(result.values.e).toBe('user@example.com');
    // Check normalization was applied
    expect(result.normalizedText).not.toContain('  ');
  });
});

// ─── Custom registry ─────────────────────────────────────────────────

describe('extract() with custom registry', () => {
  it('uses custom registry when provided', () => {
    const registry = new PatternRegistry();
    // Register a matcher that always returns "custom_value"
    registry.register('custom', {
      name: 'custom',
      extract: () => [{ value: 'custom_value', confidence: 0.99, matchedText: 'custom', offset: 0 }],
    });

    const result = extract(
      'any text',
      [{ name: 'custom', type: 'custom' }],
      { registry },
    );

    expect(result.values.custom).toBe('custom_value');
    expect(result.confidence.custom).toBe(0.99);
  });

  it('default registry has builtins', () => {
    const result = extract(
      'test@example.com',
      [{ name: 'e', type: 'email' }],
    );

    expect(result.values.e).toBe('test@example.com');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe('extract() edge cases', () => {
  it('handles empty text', () => {
    const result = extract('', [
      { name: 'email', type: 'email' },
    ]);
    expect(result.values.email).toBeUndefined();
  });

  it('handles empty fields array', () => {
    const result = extract('hello world', []);
    expect(result.values).toEqual({});
    expect(result.provenance).toEqual({});
    expect(result.confidence).toEqual({});
  });

  it('handles field with unknown type', () => {
    const result = extract(
      'some text',
      [{ name: 'unknown', type: 'unknown_type' }],
    );
    expect(result.values.unknown).toBeUndefined();
  });

  it('returns provenance and confidence for all fields', () => {
    const result = extract(
      'no match for any field',
      [
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'phone' },
      ],
    );

    expect(Object.keys(result.provenance)).toContain('email');
    expect(Object.keys(result.provenance)).toContain('phone');
    expect(result.confidence.email).toBe(0);
    expect(result.confidence.phone).toBe(0);
  });
});

// ─── ONNX/LLM Injection (test hooks for I16 stub branches) ──────────

describe('extract() ONNX/LLM injection', () => {
  it('uses ONNX injection when pattern fails', () => {
    const onnxInjection = new Map();
    onnxInjection.set('d', {
      field: 'd',
      fieldType: 'date',
      match: { value: new Date('2024-01-15'), confidence: 0.7, matchedText: '2024-01-15', offset: 0 },
    });

    const result = extract(
      'no matchable text',
      [{ name: 'd', type: 'date' }],
      { _onnxInjection: onnxInjection },
    );
    expect(result.values.d).toBeInstanceOf(Date);
    expect(result.provenance.d).toBe('onnx');
    expect(result.confidence.d).toBe(0.7);
  });

  it('uses LLM injection when pattern and ONNX fail', () => {
    const llmInjection = new Map();
    llmInjection.set('d', {
      field: 'd',
      fieldType: 'date',
      match: { value: new Date('2024-06-15'), confidence: 0.6, matchedText: 'mid-June', offset: 0 },
    });

    const result = extract(
      'no matchable text',
      [{ name: 'd', type: 'date' }],
      { _llmInjection: llmInjection },
    );
    expect(result.values.d).toBeInstanceOf(Date);
    expect(result.provenance.d).toBe('llm');
    expect(result.confidence.d).toBe(0.6);
  });

  it('prioritizes ONNX over LLM when both are injected', () => {
    const onnxInjection = new Map();
    onnxInjection.set('d', {
      field: 'd',
      fieldType: 'date',
      match: { value: 'onnx-val', confidence: 0.7, matchedText: 'onnx', offset: 0 },
    });
    const llmInjection = new Map();
    llmInjection.set('d', {
      field: 'd',
      fieldType: 'date',
      match: { value: 'llm-val', confidence: 0.6, matchedText: 'llm', offset: 0 },
    });

    const result = extract(
      'no matchable text',
      [{ name: 'd', type: 'string' }],
      { _onnxInjection: onnxInjection, _llmInjection: llmInjection },
    );
    expect(result.provenance.d).toBe('onnx');
    expect(result.values.d).toBe('onnx-val');
  });

  it('extracts ISO datetime with T separator through pattern layer', () => {
    const result = extract(
      '2024-12-31T23:59:59',
      [{ name: 'd', type: 'date' }],
    );
    expect(result.values.d).toBeInstanceOf(Date);
    expect(result.provenance.d).toBe('pattern');
    expect(result.confidence.d).toBeGreaterThan(0.8);
    const d = result.values.d as Date;
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(11); // December
    expect(d.getUTCDate()).toBe(31);
  });
});

// ─── Accuracy benchmark — General mode 8 field types ≥ 90% ─────────────

describe('extract() general mode accuracy', () => {
  function runAccuracyTest(
    _label: string,
    cases: Array<{ text: string; expected: unknown }>,
    field: FieldDescriptor,
  ): { passed: number; total: number; rate: number } {
    let passed = 0;
    for (const { text, expected } of cases) {
      const result = extract(text, [field]);
      const value = result.values[field.name];
      if (expected === undefined) {
        if (value === undefined) passed++;
      } else if (expected === null) {
        if (value !== undefined && value !== null) passed++;
      } else {
        if (value === expected || (typeof expected === 'number' && typeof value === 'number' && Math.abs(expected - value) < 1e-6)) {
          passed++;
        }
      }
    }
    const rate = cases.length > 0 ? passed / cases.length : 0;
    return { passed, total: cases.length, rate };
  }

  it('email extraction accuracy ≥ 90%', () => {
    const cases = [
      { text: 'user@domain.com', expected: 'user@domain.com' },
      { text: 'a@b.co', expected: 'a@b.co' },
      { text: 'test.user+tag@sub.domain.org', expected: 'test.user+tag@sub.domain.org' },
      { text: 'no email', expected: undefined },
      { text: 'invalid@', expected: undefined },
      { text: 'UPPERCASE@DOMAIN.COM', expected: 'uppercase@domain.com' },
      { text: 'numbers999@123domain.com', expected: 'numbers999@123domain.com' },
      { text: '@no-local.com', expected: undefined },
      { text: 'user@.nodomain', expected: undefined },
      { text: 'valid.email@company.co.uk', expected: 'valid.email@company.co.uk' },
    ];
    const result = runAccuracyTest('email', cases, { name: 'e', type: 'email' });
    expect(result.rate, `Email accuracy: ${result.passed}/${result.total}`).toBeGreaterThanOrEqual(0.9);
  });

  it('number extraction accuracy ≥ 90%', () => {
    const cases = [
      { text: '42', expected: 42 },
      { text: '3.14', expected: 3.14 },
      { text: '-5', expected: -5 },
      { text: '1,234', expected: 1234 },
      { text: 'no number', expected: undefined },
      { text: '0.001', expected: 0.001 },
      { text: '25%', expected: 0.25 },
      { text: '$99.99', expected: 99.99 },
      { text: '1.5e10', expected: 1.5e10 },
      { text: 'text', expected: undefined },
    ];
    const result = runAccuracyTest('number', cases, { name: 'n', type: 'number' });
    expect(result.rate, `Number accuracy: ${result.passed}/${result.total}`).toBeGreaterThanOrEqual(0.9);
  });

  it('boolean extraction accuracy ≥ 90%', () => {
    const cases = [
      { text: 'true', expected: true },
      { text: 'false', expected: false },
      { text: 'yes', expected: true },
      { text: 'no', expected: false },
      { text: '是', expected: true },
      { text: '否', expected: false },
      { text: '1', expected: true },
      { text: '0', expected: false },
      { text: 'maybe', expected: undefined },
      { text: 'on', expected: true },
      { text: 'off', expected: false },
    ];
    const result = runAccuracyTest('boolean', cases, { name: 'b', type: 'boolean' });
    expect(result.rate, `Boolean accuracy: ${result.passed}/${result.total}`).toBeGreaterThanOrEqual(0.9);
  });

  it('time extraction accuracy ≥ 90%', () => {
    const cases = [
      { text: '14:30', expected: '14:30:00' },
      { text: '7:30 AM', expected: '07:30:00' },
      { text: '7:30 PM', expected: '19:30:00' },
      { text: '23:59:59', expected: '23:59:59' },
      { text: 'no time', expected: undefined },
      { text: '12 PM', expected: '12:00:00' },
      { text: '12 AM', expected: '00:00:00' },
      { text: '99:99', expected: undefined },
      { text: '14:30:45', expected: '14:30:45' },
      { text: '5pm', expected: '17:00:00' },
    ];
    const result = runAccuracyTest('time', cases, { name: 't', type: 'time' });
    expect(result.rate, `Time accuracy: ${result.passed}/${result.total}`).toBeGreaterThanOrEqual(0.9);
  });
});
