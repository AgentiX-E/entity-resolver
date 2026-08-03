import { describe, it, expect } from 'vitest';
import {
  tokenizeForCLK,
  encodeBloomFilter,
  encodeBloomFilters,
  diceCoefficient,
  estimateThreshold,
  autoTuneFilter,
  averageFieldLength,
} from '../../pprl/bloom.js';

describe('tokenizeForCLK', () => {
  it('generates bigrams by default', () => {
    const tokens = tokenizeForCLK('hello');
    expect(tokens).toContain('he');
    expect(tokens).toContain('ll');
    expect(tokens).toContain('lo');
    expect(tokens.length).toBe(4); // "hello" → 4 bigrams
  });

  it('generates trigrams', () => {
    const tokens = tokenizeForCLK('hello', 3);
    expect(tokens).toContain('hel');
    expect(tokens).toContain('llo');
    expect(tokens.length).toBe(3);
  });

  it('handles empty string', () => {
    expect(tokenizeForCLK('')).toEqual([]);
  });

  it('lowercases input', () => {
    expect(tokenizeForCLK('HELLO')).toContain('he');
  });

  it('normalizes whitespace', () => {
    const tokens = tokenizeForCLK('a  b');
    expect(tokens).toContain('a ');
    expect(tokens).toContain(' b');
    expect(tokens.length).toBe(2);
  });
});

describe('encodeBloomFilter', () => {
  it('produces hex string of correct length', () => {
    const bf = encodeBloomFilter({ name: 'John' }, ['name'], { filterSize: 512 });
    expect(bf).toMatch(/^[0-9a-f]+$/);
    expect(bf.length).toBe(128); // 512 bits = 64 bytes = 128 hex chars
  });

  it('identical records produce identical filters', () => {
    const bf1 = encodeBloomFilter({ name: 'John', city: 'NYC' }, ['name', 'city']);
    const bf2 = encodeBloomFilter({ name: 'John', city: 'NYC' }, ['name', 'city']);
    expect(bf1).toBe(bf2);
  });

  it('different records produce different filters', () => {
    const bf1 = encodeBloomFilter({ name: 'John' }, ['name']);
    const bf2 = encodeBloomFilter({ name: 'Jane' }, ['name']);
    expect(bf1).not.toBe(bf2);
  });

  it('HMAC key produces different filters', () => {
    const bf1 = encodeBloomFilter({ name: 'John' }, ['name'], { hmacKey: 'key1' });
    const bf2 = encodeBloomFilter({ name: 'John' }, ['name'], { hmacKey: 'key2' });
    expect(bf1).not.toBe(bf2);
  });

  it('handles missing fields gracefully', () => {
    const bf = encodeBloomFilter({}, ['name']);
    expect(bf).toMatch(/^[0-9a-f]+$/);
    // Empty record → all-zero filter
    expect(parseInt(bf, 16)).toBe(0);
  });
});

describe('encodeBloomFilters', () => {
  it('encodes multiple records', () => {
    const filters = encodeBloomFilters(
      [{ name: 'John' }, { name: 'Jane' }],
      ['name'],
      { filterSize: 512 },
    );
    expect(filters).toHaveLength(2);
    expect(filters[0]).not.toBe(filters[1]);
  });
});

describe('diceCoefficient', () => {
  it('returns 1 for identical filters', () => {
    const bf = encodeBloomFilter({ name: 'John Smith' }, ['name']);
    expect(diceCoefficient(bf, bf)).toBe(1);
  });

  it('returns high score for similar records', () => {
    const bf1 = encodeBloomFilter({ name: 'John Smith' }, ['name']);
    const bf2 = encodeBloomFilter({ name: 'Jon Smith' }, ['name']);
    expect(diceCoefficient(bf1, bf2)).toBeGreaterThan(0.5);
  });

  it('returns low score for different records', () => {
    const bf1 = encodeBloomFilter({ name: 'John Smith' }, ['name']);
    const bf2 = encodeBloomFilter({ name: 'Mary Jones' }, ['name']);
    expect(diceCoefficient(bf1, bf2)).toBeLessThan(0.5);
  });

  it('returns 0 for different-length filters', () => {
    const bf1 = encodeBloomFilter({ name: 'A' }, ['name'], { filterSize: 512 });
    const bf2 = encodeBloomFilter({ name: 'B' }, ['name'], { filterSize: 1024 });
    expect(diceCoefficient(bf1, bf2)).toBe(0);
  });
});

describe('estimateThreshold', () => {
  it('returns value in [0.75, 0.95]', () => {
    const filters = encodeBloomFilters(
      Array.from({ length: 50 }, (_, i) => ({ name: 'User' + i })),
      ['name'],
    );
    const threshold = estimateThreshold(filters, filters);
    expect(threshold).toBeGreaterThanOrEqual(0.75);
    expect(threshold).toBeLessThanOrEqual(0.95);
  });

  it('handles empty input', () => {
    expect(estimateThreshold([], [])).toBe(0.85);
  });
});

describe('autoTuneFilter', () => {
  it('uses 512-bit for short fields', () => {
    const cfg = autoTuneFilter(4);
    expect(cfg.filterSize).toBe(512);
    expect(cfg.hashFunctions).toBe(15);
    expect(cfg.ngramSize).toBe(2);
  });

  it('uses 1024-bit for medium fields', () => {
    const cfg = autoTuneFilter(12);
    expect(cfg.filterSize).toBe(1024);
    expect(cfg.hashFunctions).toBe(20);
  });

  it('uses 2048-bit for long fields', () => {
    const cfg = autoTuneFilter(25);
    expect(cfg.filterSize).toBe(2048);
    expect(cfg.hashFunctions).toBe(25);
    expect(cfg.ngramSize).toBe(3);
  });
});

describe('averageFieldLength', () => {
  it('computes average across records', () => {
    const avg = averageFieldLength(
      [{ name: 'John' }, { name: 'Alexander' }],
      ['name'],
    );
    expect(avg).toBe(6.5); // (4 + 9) / 2
  });

  it('returns 0 for empty input', () => {
    expect(averageFieldLength([], ['name'])).toBe(0);
    expect(averageFieldLength([{ name: 'A' }], [])).toBe(0);
  });
});
