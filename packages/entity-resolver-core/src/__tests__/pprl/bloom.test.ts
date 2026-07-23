// Tests for PPRL Bloom filter encoding and matching.

import { describe, it, expect } from 'vitest';
import {
  BloomFilter, encodePPRL, matchPPRL,
  encodePPRLAsync, matchPPRLAsync, sha256Async,
} from '../../index.js';

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

// ═══════════════════════════════════════════════════════════════
// Async PPRL paths
// ═══════════════════════════════════════════════════════════════

describe('encodePPRLAsync', () => {
  it('encodes a value asynchronously', async () => {
    const filter = await encodePPRLAsync('test', { secretKey: SECRET });
    expect(filter).toBeInstanceOf(BloomFilter);
    expect(filter.size).toBeGreaterThan(0);
  });

  it('produces same result as sync version', async () => {
    const syncFilter = encodePPRL('hello-world', { secretKey: SECRET });
    const asyncFilter = await encodePPRLAsync('hello-world', { secretKey: SECRET });
    expect(Buffer.from(asyncFilter.bits).toString('hex'))
      .toBe(Buffer.from(syncFilter.bits).toString('hex'));
  });

  it('handles empty string', async () => {
    const filter = await encodePPRLAsync('', { secretKey: SECRET });
    expect(filter).toBeInstanceOf(BloomFilter);
  });
});

describe('matchPPRLAsync', () => {
  it('matches identical records asynchronously', async () => {
    const scores = await matchPPRLAsync(
      { name: 'John' },
      { name: 'John' },
      { secretKey: SECRET },
    );
    expect(scores.name).toBeGreaterThan(0);
  });

  it('different records have low match score', async () => {
    const scores = await matchPPRLAsync(
      { name: 'Alice' },
      { name: 'Bob' },
      { secretKey: SECRET },
    );
    expect(scores.name).toBeLessThan(1);
  });
});

describe('sha256Async', () => {
  it('produces consistent hash', async () => {
    const hash1 = await sha256Async('test');
    const hash2 = await sha256Async('test');
    expect(Buffer.from(hash1).toString('hex'))
      .toBe(Buffer.from(hash2).toString('hex'));
  });

  it('different inputs produce different hashes', async () => {
    const hash1 = await sha256Async('a');
    const hash2 = await sha256Async('b');
    expect(Buffer.from(hash1).toString('hex'))
      .not.toBe(Buffer.from(hash2).toString('hex'));
  });
});

describe('BloomFilter serialization', () => {
  it('toHex and fromHex roundtrip', () => {
    const bf = encodePPRL('test-data', { secretKey: SECRET });
    const hex = bf.toHex();
    const restored = BloomFilter.fromHex(hex, bf.size, bf.numHashes);
    expect(restored.size).toBe(bf.size);
    expect(restored.numHashes).toBe(bf.numHashes);
    expect(Buffer.from(restored.bits).toString('hex'))
      .toBe(Buffer.from(bf.bits).toString('hex'));
  });

  it('toBase64 and fromBase64 roundtrip', () => {
    const bf = encodePPRL('test-data', { secretKey: SECRET });
    const b64 = bf.toBase64();
    const restored = BloomFilter.fromBase64(b64, bf.size, bf.numHashes);
    expect(restored.size).toBe(bf.size);
    expect(restored.numHashes).toBe(bf.numHashes);
    expect(Buffer.from(restored.bits).toString('hex'))
      .toBe(Buffer.from(bf.bits).toString('hex'));
  });
});

describe('BloomFilter edge cases', () => {
  it('addAsync adds tokens asynchronously', async () => {
    const bf = new BloomFilter(512, 8);
    const before = Buffer.from(bf.bits).toString('hex');
    await bf.addAsync('async-test', SECRET);
    const after = Buffer.from(bf.bits).toString('hex');
    expect(before).not.toBe(after);
  });

  it('custom qgramSize works', () => {
    const bf = encodePPRL('abcdef', { secretKey: SECRET, qgramSize: 3 });
    expect(bf).toBeInstanceOf(BloomFilter);
  });

  it('similarity of identical filters is 1', () => {
    const bf1 = encodePPRL('same', { secretKey: SECRET });
    const bf2 = encodePPRL('same', { secretKey: SECRET });
    expect(bf1.similarity(bf2)).toBe(1);
  });

  it('similarity of completely different filters is low', () => {
    const bf1 = encodePPRL('aaaaaaaaaaaaaaaaaaaa', { secretKey: SECRET, filterSize: 256 });
    const bf2 = encodePPRL('bbbbbbbbbbbbbbbbbbbb', { secretKey: SECRET, filterSize: 256 });
    expect(bf1.similarity(bf2)).toBeLessThan(1);
  });

  it('encodePPRL with minimal config', () => {
    const bf = encodePPRL('minimal', { secretKey: SECRET, filterSize: 64, numHashes: 4 });
    expect(bf.size).toBe(64);
    expect(bf.numHashes).toBe(4);
  });
});
