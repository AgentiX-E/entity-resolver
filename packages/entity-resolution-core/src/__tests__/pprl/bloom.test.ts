// Tests for PPRL Bloom filter encoding and matching.

import { describe, it, expect } from 'vitest';
import { BloomFilter, encodePPRL, matchPPRL } from '../../index.js';

const SECRET = 'test-secret-key-for-pprl';

describe('BloomFilter', () => {
  it('creates filter with correct size', () => {
    const bf = new BloomFilter(1024, 15);
    expect(bf.size).toBe(1024);
    expect(bf.numHashes).toBe(15);
    expect(bf.bits.length).toBe(128); // 1024/8
  });

  it('adds tokens and sets bits', () => {
    const bf = new BloomFilter(1024, 15);
    const before = Buffer.from(bf.bits).toString('hex');
    bf.add('test', SECRET);
    const after = Buffer.from(bf.bits).toString('hex');
    expect(before).not.toBe(after);
  });

  it('identical tokens with same secret produce same bits', () => {
    const bf1 = new BloomFilter(1024, 15);
    const bf2 = new BloomFilter(1024, 15);
    bf1.add('hello', SECRET);
    bf2.add('hello', SECRET);
    expect(Buffer.from(bf1.bits).toString('hex')).toBe(Buffer.from(bf2.bits).toString('hex'));
  });

  it('different secrets produce different bits', () => {
    const bf1 = new BloomFilter(1024, 15);
    const bf2 = new BloomFilter(1024, 15);
    bf1.add('hello', 'secret-a');
    bf2.add('hello', 'secret-b');
    expect(Buffer.from(bf1.bits).toString('hex')).not.toBe(Buffer.from(bf2.bits).toString('hex'));
  });

  it('computes high similarity for similar tokens', () => {
    const bf1 = new BloomFilter(1024, 15);
    const bf2 = new BloomFilter(1024, 15);
    bf1.add('john', SECRET); bf1.add('smith', SECRET);
    bf2.add('john', SECRET); bf2.add('smith', SECRET);
    expect(bf1.similarity(bf2)).toBe(1);
  });

  it('computes low similarity for different tokens', () => {
    const bf1 = new BloomFilter(1024, 15);
    const bf2 = new BloomFilter(1024, 15);
    bf1.add('alice', SECRET);
    bf2.add('bob', SECRET);
    expect(bf1.similarity(bf2)).toBeLessThan(0.5);
  });

  it('hex serialization roundtrips', () => {
    const bf = new BloomFilter(1024, 15);
    bf.add('alice', SECRET); bf.add('bob', SECRET);
    const hex = bf.toHex();
    const restored = BloomFilter.fromHex(hex, 1024, 15);
    expect(restored.similarity(bf)).toBe(1);
  });

  it('different size filters return 0 similarity', () => {
    const bf1 = new BloomFilter(1024, 15);
    const bf2 = new BloomFilter(512, 10);
    expect(bf1.similarity(bf2)).toBe(0);
  });
});

describe('encodePPRL', () => {
  it('encodes string into Bloom filter', () => {
    const bf = encodePPRL('John Smith', { secretKey: SECRET });
    expect(bf.size).toBe(1024);
    expect(bf.numHashes).toBe(15);
  });

  it('same value produces same encoding', () => {
    const bf1 = encodePPRL('John Smith', { secretKey: SECRET });
    const bf2 = encodePPRL('John Smith', { secretKey: SECRET });
    expect(bf1.toHex()).toBe(bf2.toHex());
  });

  it('similar values produce high similarity', () => {
    const bf1 = encodePPRL('John Smith', { secretKey: SECRET });
    const bf2 = encodePPRL('Jon Smith', { secretKey: SECRET });
    expect(bf1.similarity(bf2)).toBeGreaterThan(0.3);
  });

  it('different values produce low similarity', () => {
    const bf1 = encodePPRL('John Smith', { secretKey: SECRET });
    const bf2 = encodePPRL('Mary Jones', { secretKey: SECRET });
    expect(bf1.similarity(bf2)).toBeLessThan(0.5);
  });

  it('different secrets produce different encodings', () => {
    const bf1 = encodePPRL('John Smith', { secretKey: 'secret-1' });
    const bf2 = encodePPRL('John Smith', { secretKey: 'secret-2' });
    expect(bf1.toHex()).not.toBe(bf2.toHex());
  });
});

describe('matchPPRL', () => {
  it('matches two records field by field', () => {
    const scores = matchPPRL(
      { name: 'John Smith', city: 'New York' },
      { name: 'Jon Smith', city: 'New York' },
      { secretKey: SECRET },
    );
    expect(scores.name).toBeGreaterThan(0);
    expect(scores.city).toBe(1);
  });

  it('reports different scores for different fields', () => {
    const scores = matchPPRL(
      { name: 'Alice', dob: '1990-01-15' },
      { name: 'Bob', dob: '1990-01-16' },
      { secretKey: SECRET },
    );
    expect(scores.name).toBeDefined();
    expect(scores.dob).toBeGreaterThan(0.8); // one day diffs -> high similarity
  });

  it('respects custom filter size', () => {
    const scores = matchPPRL(
      { name: 'John' },
      { name: 'John' },
      { secretKey: SECRET, filterSize: 512, numHashes: 8 },
    );
    expect(scores.name).toBeGreaterThan(0);
  });

  it('only matches fields present in both records', () => {
    const scores = matchPPRL(
      { name: 'John', extra: 'value' },
      { name: 'John' },
      { secretKey: SECRET },
    );
    expect(scores.name).toBeDefined();
    expect(scores.extra).toBeUndefined();
  });
});
