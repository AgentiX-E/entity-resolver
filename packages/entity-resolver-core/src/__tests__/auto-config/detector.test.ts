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
    expect(nameComp!.scorerName).toBe('ensemble'); // I35: ensemble for name fields

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

  it('detects numeric values by content, cardinality guard reclassifies near-unique as identifier', () => {
    // 10 unique numeric-looking values → cardinality guard (≥0.95) → identifier
    const records = Array.from({ length: 10 }, (_, i) => ({ val: String(i * 1.5) }));
    const result = autoConfigure(records);
    const numField = result.fields.find((f) => f.name === 'val');
    expect(numField).toBeDefined();
    expect(numField!.semanticType).toBe('identifier'); // I36: cardinality guard
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
    const hasSoundex = passes.some((p) => p.transforms.includes('soundex'));
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

  it('detects postcode-like alphanumeric values, cardinality guard reclassifies near-unique', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      code: `AB${i} 2CD`,
    }));
    const result = autoConfigure(records);
    const field = result.fields.find((f) => f.name === 'code');
    expect(field!).toBeDefined();
    // 10 unique postcode-like values → cardinality guard → identifier
    expect(field!.semanticType).toBe('identifier'); // I36: cardinality guard
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

// ═══════════════════════════════════════════════════════════════
// I36: Cardinality Guard & Advanced Field Detection
// ═══════════════════════════════════════════════════════════════

describe('cardinality guard (I36)', () => {
  it('reclassifies near-unique phone fields as identifier', () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      phone: `555-${String(i).padStart(4, '0')}`,
      name: 'Test Person',
    }));
    const fields = detectFields(records);
    const phoneField = fields.find((f) => f.name === 'phone');
    // All values are unique → cardinality 1.0 → reclassified as identifier
    expect(phoneField!.semanticType).toBe('identifier');
  });

  it('does NOT reclassify low-cardinality phone fields', () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      phone: i < 50 ? '555-0001' : '555-0002',
      name: 'Test Person',
    }));
    const fields = detectFields(records);
    const phoneField = fields.find((f) => f.name === 'phone');
    // Only 2 unique values → low cardinality → stays as phone
    expect(phoneField!.semanticType).toBe('phone');
  });

  it('reclassifies near-unique numeric field as identifier', () => {
    const records = Array.from({ length: 50 }, (_, i) => ({
      id: String(10000 + i),
    }));
    const fields = detectFields(records);
    const idField = fields.find((f) => f.name === 'id');
    // name 'id' matches identifier pattern, so it's already identifier
    expect(idField!.semanticType).toBe('identifier');
  });

  it('handles small datasets with relaxed cardinality floor', () => {
    // With 10 records, floor = max(0.95, 1-1/√10) = max(0.95, 0.684) = 0.95
    // So 10/10 = 1.0 unique → should reclassify
    const records = Array.from({ length: 10 }, (_, i) => ({
      zip: `${String(10000 + i)}`,
      name: 'Test',
    }));
    const fields = detectFields(records);
    const zipField = fields.find((f) => f.name === 'zip');
    expect(zipField!.semanticType).toBe('identifier');
  });

  it('sets confidence to 0.85 after reclassification', () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      amount: String(i * 100),
      name: 'Test',
    }));
    const fields = detectFields(records);
    const amountField = fields.find((f) => f.name === 'amount');
    expect(amountField!.confidence).toBe(0.85);
  });
});

describe('short-code detection (I36)', () => {
  it('marks mixed alphanumeric short codes', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      code: `AB${String(i).padStart(3, '0')}`,
    }));
    const fields = detectFields(records);
    const codeField = fields.find((f) => f.name === 'code');
    expect(codeField!.semanticType).toBe('identifier');
    expect((codeField as any)._shortCode).toBe(true);
  });

  it('does NOT mark pure alpha fields as short code', () => {
    const records = Array.from({ length: 10 }, () => ({
      code: 'ABCDEF',
    }));
    const fields = detectFields(records);
    const codeField = fields.find((f) => f.name === 'code');
    expect((codeField as any)._shortCode).toBeFalsy();
  });

  it('does NOT mark long values as short code', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      code: `AB${String(i).padStart(3, '0')}XXXXXXXXXXXX`,
    }));
    const fields = detectFields(records);
    const codeField = fields.find((f) => f.name === 'code');
    expect((codeField as any)._shortCode).toBeFalsy();
  });
});

describe('multi-value name detection (I36)', () => {
  it('detects comma-delimited multi-value fields', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      authors: `Author Name One, Author Name Two, Author Name Three ${i}`,
    }));
    const fields = detectFields(records);
    const authorField = fields.find((f) => f.name === 'authors');
    expect((authorField as any)._multiValue).toBe(true);
  });

  it('does NOT mark single-value long fields as multi-value', () => {
    const records = Array.from({ length: 10 }, () => ({
      description: 'This is a very long description that exceeds thirty characters',
    }));
    const fields = detectFields(records);
    const descField = fields.find((f) => f.name === 'description');
    expect((descField as any)._multiValue).toBeFalsy();
  });

  it('required ≥70% rows have ≥2 delimiters to trigger', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      authors: i < 5 ? 'Author A, Author B, Author C' : 'Single Author',
    }));
    const fields = detectFields(records);
    const authorField = fields.find((f) => f.name === 'authors');
    // Only 5/10 rows have ≥2 commas → 50% < 70% → should NOT trigger
    expect((authorField as any)._multiValue).toBeFalsy();
  });
});

describe('confidence-weighted scoring (I36)', () => {
  it('low-confidence fields get capped weight in comparisons', () => {
    const records = Array.from({ length: 10 }, () => ({
      first_name: 'John',
      last_name: 'Doe',
      mystery: 'abcdefghij',
    }));
    const result = autoConfigure(records);
    // mystery field should have text type with low confidence → weight 0.3
    const mysteryComp = result.config.comparisons?.find((c) => c.field === 'mystery');
    // If included, it should have weight 0.3
    if (mysteryComp) {
      expect((mysteryComp as any).weight).toBe(0.3);
    }
  });

  it('high-confidence fields do NOT get capped', () => {
    const records = Array.from({ length: 10 }, () => ({
      email: 'test@example.com',
      first_name: 'John',
    }));
    const result = autoConfigure(records);
    const emailComp = result.config.comparisons?.find((c) => c.field === 'email');
    expect(emailComp).toBeDefined();
    expect((emailComp as any).weight).toBeUndefined(); // No cap
  });
});
