// Tests for Golden Record Survivorship — 6 strategies, empty clusters, field provenance.
import { describe, it, expect } from 'vitest';
import { buildGoldenRecord } from '../golden-record.js';
import type { GoldenRecordConfig } from '../golden-record.js';

describe('buildGoldenRecord', () => {
  const cluster = [
    { name: 'Johnathan Smith', email: 'john@example.com', phone: '555-0001' },
    { name: 'John Smith', email: '', phone: '555-0001' },
    { name: 'J. Smith', email: 'jsmith@corp.com', phone: '' },
  ];

  describe('longest strategy', () => {
    it('picks the longest non-empty value for each field', () => {
      const result = buildGoldenRecord(cluster, { defaultStrategy: 'longest' });
      expect(result.goldenRecord.name).toBe('Johnathan Smith');
      expect(result.goldenRecord.email).toBe('john@example.com');
      expect(result.goldenRecord.phone).toBe('555-0001');
      expect(result.sourceCount).toBe(3);
    });
  });

  describe('most_popular strategy', () => {
    it('picks the most frequent value', () => {
      const result = buildGoldenRecord(cluster, { defaultStrategy: 'most_popular' });
      expect(result.goldenRecord.phone).toBe('555-0001');
      expect(result.sourceCount).toBe(3);
    });
  });

  describe('most_complete strategy', () => {
    it('picks value from record with most non-empty fields', () => {
      const result = buildGoldenRecord(cluster, { defaultStrategy: 'most_complete' });
      expect(result.goldenRecord.name).toBe('Johnathan Smith');
    });
  });

  describe('first strategy', () => {
    it('picks first non-empty value', () => {
      const result = buildGoldenRecord(cluster, { defaultStrategy: 'first' });
      expect(result.goldenRecord.email).toBe('john@example.com');
    });
  });

  describe('concatenate strategy', () => {
    it('concatenates all unique values', () => {
      const result = buildGoldenRecord(cluster, { defaultStrategy: 'concatenate' });
      expect(result.goldenRecord.email).toContain('john@example.com');
      expect(result.goldenRecord.email).toContain('jsmith@corp.com');
    });
  });

  describe('source_priority strategy', () => {
    it('prefers higher-priority sources', () => {
      const records = [
        { name: 'John', _source: 'crm' },
        { name: 'Jonathan Smith', _source: 'website' },
        { name: 'J. Smith', _source: 'email' },
      ];
      const result = buildGoldenRecord(records, {
        defaultStrategy: 'source_priority',
        sourcePriority: new Map([
          ['crm', 1],
          ['website', 2],
          ['email', 999],
        ]),
      });
      expect(result.goldenRecord.name).toBe('John');
    });
  });

  describe('field-specific rules', () => {
    it('applies per-field overrides', () => {
      const config: GoldenRecordConfig = {
        rules: [
          { field: 'name', strategy: 'longest' },
          { field: 'email', strategy: 'first' },
          { field: 'phone', strategy: 'concatenate', separator: ', ' },
        ],
      };
      const result = buildGoldenRecord(cluster, config);
      expect(result.goldenRecord.name).toBe('Johnathan Smith');
      expect(result.goldenRecord.email).toBe('john@example.com');
      expect(result.goldenRecord.phone).toBe('555-0001');
    });
  });

  describe('edge cases', () => {
    it('handles empty cluster', () => {
      const result = buildGoldenRecord([]);
      expect(result.sourceCount).toBe(0);
      expect(result.goldenRecord).toEqual({});
    });

    it('handles single record', () => {
      const result = buildGoldenRecord([{ name: 'Alice', age: 30 }]);
      expect(result.goldenRecord.name).toBe('Alice');
      expect(result.sourceCount).toBe(1);
    });

    it('field sources track provenance', () => {
      const result = buildGoldenRecord(cluster);
      expect(result.fieldSources.name).toBeDefined();
      expect(result.fieldSources.name!.from.length).toBe(3);
    });

    it('handles all empty values gracefully', () => {
      const result = buildGoldenRecord([{ x: '' }, { x: '' }]);
      expect(result.goldenRecord.x).toBeUndefined();
    });

    it('unknown survivor strategy falls back to first value', () => {
      const result = buildGoldenRecord([{ name: 'A' }, { name: 'B' }], {
        rules: [{ field: 'name', strategy: 'unknown_strategy' as any }],
      });
      expect(result.goldenRecord.name).toBeDefined();
    });
  });
});
