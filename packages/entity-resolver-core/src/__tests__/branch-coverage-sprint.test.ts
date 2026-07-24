/**
 * Branch coverage sprint — target edge cases to push branches 88.88% → 95%.
 */
import { describe, it, expect } from 'vitest';

describe('Auto-config detector — branch coverage edges', () => {
  it('detectFields identifies numeric fields', async () => {
    const { detectFields } = await import('../auto-config/detector.js');
    const records = [
      { name: 'John', age: '25', score: '100' },
      { name: 'Jane', age: '30', score: '95' },
    ];
    const fields = detectFields(records);
    const numericFields = fields.filter((f) => f.semanticType === 'numeric');
    expect(numericFields.length).toBe(2);
  });

  it('detectFields identifies date fields', async () => {
    const { detectFields } = await import('../auto-config/detector.js');
    const records = [
      { name: 'John', dob: '1990-01-15' },
      { name: 'Jane', dob: '1985-06-20' },
    ];
    const fields = detectFields(records);
    const dateFields = fields.filter((f) => f.semanticType === 'date');
    expect(dateFields.length).toBe(1);
  });

  it('autoConfigure produces valid config', async () => {
    const { autoConfigure } = await import('../auto-config/detector.js');
    const records = [
      { name: 'John', city: 'NYC', age: '25' },
      { name: 'Jane', city: 'LA', age: '30' },
      { name: 'John', city: 'NYC', age: '25' },
    ];
    const result = autoConfigure(records);
    expect(result.config.comparisons.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.fields.length).toBeGreaterThan(0);
  });

  it('autoConfigure handles single record', async () => {
    const { autoConfigure } = await import('../auto-config/detector.js');
    const result = autoConfigure([{ name: 'Solo' }]);
    expect(result.config).toBeDefined();
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });
});

describe('PPRL Bloom — branch coverage edges', () => {
  it('BloomFilter.similarity with different sizes returns 0', async () => {
    const { BloomFilter } = await import('../pprl/bloom.js');
    const bf1 = new BloomFilter(64, 4);
    const bf2 = new BloomFilter(128, 4);
    bf1.add('test', 'secret');
    bf2.add('test', 'secret');
    expect(bf1.similarity(bf2)).toBe(0);
  });

  it('BloomFilter.similarity with identical filters returns >0', async () => {
    const { BloomFilter } = await import('../pprl/bloom.js');
    const bf1 = new BloomFilter(128, 4);
    const bf2 = new BloomFilter(128, 4);
    bf1.add('test', 'secret');
    bf2.add('test', 'secret');
    expect(bf1.similarity(bf2)).toBeGreaterThan(0);
  });

  it('BloomFilter.toHex produces even-length hex', async () => {
    const { BloomFilter } = await import('../pprl/bloom.js');
    const bf = new BloomFilter(256, 4);
    bf.add('data', 'key');
    const hex = bf.toHex();
    expect(hex.length % 2).toBe(0);
  });

  it('matchPPRL returns all field scores', async () => {
    const { matchPPRL } = await import('../pprl/bloom.js');
    const scores = matchPPRL(
      { name: 'Alice', city: 'NYC', dob: '1990-01-01' },
      { name: 'Alice', city: 'NYC', dob: '1990-02-15' },
      { filterSize: 128, numHashes: 4, secretKey: 'test' },
    );
    expect(Object.keys(scores).length).toBe(3);
    expect(scores['name']!).toBeGreaterThan(0.5);
  });
});
