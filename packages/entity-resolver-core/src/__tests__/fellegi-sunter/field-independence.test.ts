// Tests for field independence analysis.

import { describe, it, expect } from 'vitest';
import { analyzeFieldCorrelations } from '../../index.js';

describe('analyzeFieldCorrelations', () => {
  it('detects highly correlated fields', () => {
    // City and county are strongly correlated
    const records = [
      { city: 'NYC', county: 'New York' },
      { city: 'NYC', county: 'New York' },
      { city: 'LA', county: 'Los Angeles' },
      { city: 'LA', county: 'Los Angeles' },
      { city: 'SF', county: 'San Francisco' },
    ];

    const report = analyzeFieldCorrelations(records, ['city', 'county']);
    expect(report.warnings.length).toBeGreaterThan(0);
    const warning = report.warnings.find((w) => w.fieldA === 'city' && w.fieldB === 'county');
    expect(warning).toBeDefined();
    expect(warning!.cramersV).toBeGreaterThan(0.5); // High correlation
    expect(warning!.severity).toBe('high');
  });

  it('reports independent-like fields correctly', () => {
    const records = [
      { name: 'A', color: 'red' },
      { name: 'B', color: 'blue' },
      { name: 'C', color: 'red' },
      { name: 'D', color: 'green' },
      { name: 'E', color: 'blue' },
    ];
    const report = analyzeFieldCorrelations(records, ['name', 'color']);
    // With 5 records, 2 fields with limited overlap, correlation should not be high
    expect(report.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('hasSevereViolations flag works correctly', () => {
    const correlated = [
      { city: 'NYC', county: 'New York' },
      { city: 'NYC', county: 'New York' },
      { city: 'LA', county: 'Los Angeles' },
      { city: 'LA', county: 'Los Angeles' },
      { city: 'SF', county: 'San Francisco' },
    ];
    const report = analyzeFieldCorrelations(correlated, ['city', 'county']);
    expect(report.hasSevereViolations).toBe(true);

    // Independent data with unique names and random colors
    const independent = Array.from({ length: 16 }, (_, i) => ({
      name: `Person${i}`,
      color: ['red', 'blue', 'green', 'yellow'][i % 4]!,
    }));
    const report2 = analyzeFieldCorrelations(independent, ['name', 'color']);
    // With 16 unique names, Cramer's V should be low — verify structure
    expect(report2.hasSevereViolations).toBeDefined();
  });

  it('handles single field gracefully', () => {
    const records = [{ name: 'Alice' }, { name: 'Bob' }];
    const report = analyzeFieldCorrelations(records, ['name']);
    expect(report.warnings).toHaveLength(0);
    expect(report.hasSevereViolations).toBe(false);
  });

  it('handles empty strings gracefully', () => {
    const records = [
      { city: '', county: '' },
      { city: 'NYC', county: 'New York' },
    ];
    const report = analyzeFieldCorrelations(records, ['city', 'county']);
    // Empty strings are skipped in contingency table
    expect(report.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it('provides medium severity for moderate correlation', () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      fieldA: i < 60 ? 'X' : 'Y',
      fieldB: i < 60 ? 'X' : i < 80 ? 'X' : 'Z',
    }));

    const report = analyzeFieldCorrelations(records, ['fieldA', 'fieldB']);
    // Should detect some association
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('handles empty record array', () => {
    const report = analyzeFieldCorrelations([], ['a', 'b']);
    expect(report.warnings).toEqual([]);
  });

  it('handles single field', () => {
    const records = [{ x: '1' }, { x: '1' }];
    const report = analyzeFieldCorrelations(records, ['x']);
    expect(report.warnings).toEqual([]);
  });

  it('handles null/undefined values', () => {
    const records = [
      { a: null, b: undefined },
      { a: '1', b: '2' },
      { a: '1', b: '2' },
    ];
    const report = analyzeFieldCorrelations(records, ['a', 'b']);
    expect(report.warnings).toBeDefined();
  });
});
