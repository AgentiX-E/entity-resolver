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
});
