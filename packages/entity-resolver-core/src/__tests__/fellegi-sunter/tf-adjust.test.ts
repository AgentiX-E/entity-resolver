// Tests for Term Frequency Adjustment.

import { describe, it, expect } from 'vitest';
import {
  buildTermFrequencies,
  computeTFAdjustment,
  adjustWeightByTF,
  TFAdjustmentLookup,
} from '../../index.js';

describe('computeTFAdjustment', () => {
  it('returns ~1 for rare values (freq=1, total=1000)', () => {
    const adjustment = computeTFAdjustment(1, 1000);
    expect(adjustment).toBe(1); // log10(1)=0, so 1 - 0/log10(1000) = 1
  });

  it('returns < 1 for common values (freq=500, total=1000)', () => {
    const adjustment = computeTFAdjustment(500, 1000);
    expect(adjustment).toBeLessThan(1);
    expect(adjustment).toBeGreaterThan(0);
  });

  it('has floor at 0.1 for extremely common values', () => {
    const adjustment = computeTFAdjustment(999, 1000);
    expect(adjustment).toBeGreaterThanOrEqual(0.1);
  });

  it('returns 1 for edge cases', () => {
    expect(computeTFAdjustment(0, 100)).toBe(1);
    expect(computeTFAdjustment(10, 1)).toBe(1); // totalRecords=1 => log10(1)=0
  });

  it('provides monotonic decrease with frequency', () => {
    const a1 = computeTFAdjustment(10, 1000);
    const a2 = computeTFAdjustment(100, 1000);
    const a3 = computeTFAdjustment(500, 1000);
    expect(a1).toBeGreaterThan(a2);
    expect(a2).toBeGreaterThan(a3);
  });
});

describe('adjustWeightByTF', () => {
  it('reduces weight for common values', () => {
    const adjusted = adjustWeightByTF(10, 100, 1000);
    const raw = adjustWeightByTF(10, 1, 1000);
    expect(adjusted).toBeLessThan(raw);
  });

  it('does not reduce weight for unique values', () => {
    const adjusted = adjustWeightByTF(10, 1, 1000);
    expect(adjusted).toBe(10);
  });
});

describe('buildTermFrequencies', () => {
  it('builds frequencies for named fields', () => {
    const records = [
      { name: 'John', city: 'NYC' },
      { name: 'John', city: 'LA' },
      { name: 'Jane', city: 'NYC' },
    ];
    const freqs = buildTermFrequencies(records, ['name', 'city']);
    expect(freqs.get('name')).toHaveLength(2); // John, Jane
    expect(freqs.get('city')).toHaveLength(2); // NYC, LA

    const nameFreqs = freqs.get('name')!;
    const john = nameFreqs.find((f: any) => f.value === 'john')!;
    expect(john.frequency).toBe(2);
    expect(john.ratio).toBe(2 / 3);
  });

  it('skips empty values', () => {
    const records = [{ name: 'John' }, { name: '' }, { name: 'Jane' }];
    const freqs = buildTermFrequencies(records, ['name']);
    expect(freqs.get('name')).toHaveLength(2); // John and Jane only
  });
});

describe('TFAdjustmentLookup', () => {
  it('creates lookup from frequencies', () => {
    const records = [{ name: 'John' }, { name: 'John' }, { name: 'Jane' }];
    const freqs = buildTermFrequencies(records, ['name']);
    const lookup = new TFAdjustmentLookup(freqs);

    // John appears 2/3 => adjustment < 1
    expect(lookup.getAdjustment('name', 'John')).toBeLessThan(1);

    // Jane appears 1/3 => adjustment = 1
    expect(lookup.getAdjustment('name', 'Jane')).toBe(1);

    // Unknown value => default 1
    expect(lookup.getAdjustment('name', 'Unknown')).toBe(1);
    expect(lookup.getAdjustment('name', '')).toBe(1);
    expect(lookup.getAdjustment('name', null)).toBe(1);
  });
});

describe('TF edge cases', () => {
  it('adjustWeightByTF with zero frequency returns original weight', () => {
    expect(adjustWeightByTF(5, 0, 1000)).toBe(5);
  });

  it('adjustWeightByTF with frequency >= total returns floor-adjusted weight', () => {
    const adjusted = adjustWeightByTF(10, 1000, 1000);
    expect(adjusted).toBeLessThanOrEqual(1); // 0.1 * 10 = 1
  });

  it('adjustWeightByTF with total=1 returns original', () => {
    expect(adjustWeightByTF(7, 5, 1)).toBe(7);
  });

  it('buildTermFrequencies with empty records returns empty maps', () => {
    const freqs = buildTermFrequencies([], ['name']);
    expect(freqs.get('name')).toEqual([]);
  });

  it('buildTermFrequencies with non-existent field', () => {
    const records = [{ name: 'test' }, { name: 'test2' }];
    const freqs = buildTermFrequencies(records, ['nonexistent']);
    expect(freqs.get('nonexistent')).toEqual([]);
  });
});
