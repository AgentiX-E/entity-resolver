// Tests for auto-config field detection and configuration generation.

import { describe, it, expect } from 'vitest';
import { detectFields, autoConfigure } from '../../index.js';

const testRecords = [
  {
    email: 'john@example.com',
    name: 'John Smith',
    phone: '555-1234',
    city: 'New York',
    zip: '10001',
    dob: '1990-01-15',
    age: '34',
    notes: 'regular customer since 2020',
  },
  {
    email: 'jane@example.com',
    name: 'Jane Doe',
    phone: '555-5678',
    city: 'Los Angeles',
    zip: '90001',
    dob: '1985-06-20',
    age: '39',
    notes: 'premium plan',
  },
  {
    email: 'bob@test.org',
    name: 'Bob Wilson',
    phone: '555-9012',
    city: 'Chicago',
    zip: '60601',
    dob: '1978-03-10',
    age: '46',
    notes: 'new customer',
  },
];

describe('detectFields', () => {
  it('detects all fields in a dataset', () => {
    const fields = detectFields(testRecords);
    expect(fields.length).toBe(Object.keys(testRecords[0]!).length);
  });

  it('assigns semantic types to fields', () => {
    const fields = detectFields(testRecords);
    const emailField = fields.find((f) => f.name === 'email');
    expect(emailField).toBeDefined();
    expect(emailField!.semanticType).toBe('email');

    const nameField = fields.find((f) => f.name === 'name');
    expect(nameField).toBeDefined();
    expect(nameField!.semanticType).toBe('name');
  });

  it('reports confidence levels', () => {
    const fields = detectFields(testRecords);
    for (const f of fields) {
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('reports field statistics', () => {
    const fields = detectFields(testRecords);
    for (const f of fields) {
      expect(f.cardinality).toBeGreaterThanOrEqual(0);
      expect(f.nullRatio).toBeGreaterThanOrEqual(0);
      expect(f.nullRatio).toBeLessThanOrEqual(1);
      expect(f.avgLength).toBeGreaterThanOrEqual(0);
      expect(f.sampleValues.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles empty records', () => {
    const fields = detectFields([]);
    expect(fields).toHaveLength(0);
  });

  it('handles null and undefined values', () => {
    const records = [{ name: null as any, email: undefined as any, city: 'NYC' }];
    const fields = detectFields(records);
    expect(fields.length).toBe(3);
    expect(fields[0]!.nullRatio).toBeGreaterThan(0);
  });

  it('detects date fields by value pattern', () => {
    const records = Array.from({ length: 10 }, () => ({ dob: '2020-01-15' }));
    const fields = detectFields(records);
    const dobField = fields.find((f) => f.name === 'dob');
    expect(dobField!.semanticType).toBe('date');
  });

  it('detects numeric fields by value pattern', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ price: String(i * 10) }));
    const fields = detectFields(records);
    expect(fields[0]!.isNumeric).toBe(true);
  });
});

describe('autoConfigure', () => {
  it('generates full config from records', () => {
    const result = autoConfigure(testRecords);
    expect(result.config.comparisons.length).toBeGreaterThan(0);
    expect(result.config.blocking.passes?.length ?? 0).toBeGreaterThan(0);
    expect(result.config.matchThreshold).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('generates blocking passes for high-cardinality fields', () => {
    const result = autoConfigure(testRecords);
    const passes = result.config.blocking.passes ?? [];
    expect(passes.length).toBeGreaterThan(0);
    // Should prefer email as primary pass
    const hasEmailPass = passes.some((p) => p.fields.includes('email'));
    expect(hasEmailPass).toBe(true);
  });

  it('assigns appropriate scorers per field type', () => {
    const result = autoConfigure(testRecords);
    const emailComp = result.config.comparisons.find((c) => c.field === 'email');
    expect(emailComp).toBeDefined();
    expect(emailComp!.scorerName).toBe('exact');

    const nameComp = result.config.comparisons.find((c) => c.field === 'name');
    expect(nameComp).toBeDefined();
    expect(nameComp!.scorerName).toBe('jaro_winkler');

    const ageComp = result.config.comparisons.find((c) => c.field === 'age');
    if (ageComp) {
      expect(ageComp.scorerName).toBe('numeric_diff');
    }
  });

  it('handles empty records gracefully', () => {
    const result = autoConfigure([]);
    expect(result.config.blocking.passes).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('generates warnings for low-confidence fields', () => {
    const records = [{ unknown_field: 'some value' }, { unknown_field: 'another' }];
    const result = autoConfigure(records);
    // unknown_field should have low confidence (falls to 'text' with 0.5 or 0.8 from value detection)
    if (result.confidence < 0.7) {
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it('confidence is averaged across fields', () => {
    const records = [
      { email: 'a@b.com', name: 'Test', city: 'X' },
      { email: 'c@d.com', name: 'Test2', city: 'Y' },
    ];
    const result = autoConfigure(records);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('tfFields are populated for surname/company types', () => {
    const records = [
      { name: 'John', surname: 'Smith', company: 'Acme' },
      { name: 'Jane', surname: 'Smith', company: 'Acme' },
    ];
    const result = autoConfigure(records);
    expect(result.config.tfFields).toBeDefined();
  });

  it('detects date values by content (YYYY-MM-DD format)', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      event_date: `2023-0${(i % 9) + 1}-15`,
    }));
    const result = autoConfigure(records);
    const dateField = result.fields.find((f) => f.name === 'event_date');
    expect(dateField).toBeDefined();
    expect(dateField!.semanticType).toBe('date');
  });

  it('detects numeric values by content', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({ val: String(i * 1.5) }));
    const result = autoConfigure(records);
    const numField = result.fields.find((f) => f.name === 'val');
    expect(numField).toBeDefined();
    expect(numField!.semanticType).toBe('numeric');
    expect(numField!.isNumeric).toBe(true);
  });

  it('handles empty dataset gracefully', () => {
    const result = autoConfigure([]);
    expect(result.fields).toHaveLength(0);
    expect(result.confidence).toBe(0);
    expect(result.warnings).toContain('Empty dataset');
  });

  it('generates warning for low-confidence fields', () => {
    const records = [{ xyz_unknown_field: 'some value' }];
    const result = autoConfigure(records);
    expect(result.fields[0]!.confidence).toBeLessThan(0.7);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('uses soundex on single-name blocking for small datasets', () => {
    // Only one name field without surname → soundex-only blocking
    const records = [{ given_name: 'John', city: 'NY' }];
    const result = autoConfigure(records);
    const passes = result.config.blocking.passes ?? [];
    expect(passes.length).toBeGreaterThan(0);
    const hasSoundex = passes.some(
      (p) => p.transforms.includes('soundex'),
    );
    expect(hasSoundex).toBe(true);
  });

  it('returns 0.7 threshold for high-confidence fields', () => {
    const records = [
      { email: 'a@b.com', phone: '123-4567', name: 'Test' },
      { email: 'c@d.com', phone: '789-0123', name: 'Other' },
    ];
    const result = autoConfigure(records);
    expect(result.config.matchThreshold).toBe(0.7);
  });
});

describe('detectFields edge cases', () => {
  it('returns empty for empty records array', async () => {
    const { detectFields } = await import('../../index.js');
    expect(detectFields([])).toHaveLength(0);
  });

  it('detects postcode-like alphanumeric values', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      code: `AB${i}CD`,
    }));
    const result = autoConfigure(records);
    const field = result.fields.find((f) => f.name === 'code');
    expect(field!).toBeDefined();
    // 3-10 alphanumeric chars may be detected as postcode if >80% match
    expect(field!.semanticType).toBe('postcode');
  });

  it('falls back to text for unrecognized patterns', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      mystery_column: `xyz-${i}-abc-def-ghi`,
    }));
    const result = autoConfigure(records);
    const field = result.fields.find((f) => f.name === 'mystery_column');
    expect(field!.semanticType).toBe('text');
    expect(field!.confidence).toBe(0.5);
  });
});
