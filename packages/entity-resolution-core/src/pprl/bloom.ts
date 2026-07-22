// Privacy-Preserving Record Linkage (PPRL) — Bloom filter encoding.
// Enables entity matching without exposing raw PII.
// Uses Bloom filters to encode field values into bit vectors for private comparison.

import { createHash } from 'crypto';

/** PPRL configuration for Bloom filter encoding. */
export interface PPRLConfig {
  /** Bloom filter size in bits. Default: 1024. Larger = more secure, slower. */
  readonly filterSize?: number;
  /** Number of hash functions. Default: 15. More = lower false positive rate. */
  readonly numHashes?: number;
  /** Secret key for salted hashing. Must be shared between matching parties. */
  readonly secretKey: string;
  /** Q-gram size for tokenization. Default: 2 (bigrams). */
  readonly qgramSize?: number;
}

/** Encoded Bloom filter representation. */
export class BloomFilter {
  readonly bits: Uint8Array;
  readonly size: number;
  readonly numHashes: number;

  constructor(size: number, numHashes: number) {
    this.size = size;
    this.numHashes = numHashes;
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }

  /** Add a token to the Bloom filter. */
  add(token: string, secret: string): void {
    const byteLen = Math.ceil(this.size / 8);
    for (let i = 0; i < this.numHashes; i++) {
      const hash = createHash('sha256')
        .update(`${secret}:${i}:${token}`)
        .digest();
      // Use first 4 bytes as a 32-bit integer to determine bit position
      const pos = (hash.readUInt32BE(0) * (i + 1)) % this.size;
      const byteIdx = Math.floor(pos / 8);
      const bitIdx = pos % 8;
      this.bits[byteIdx]! |= 1 << bitIdx;
    }
  }

  /** Compute Dice coefficient similarity with another Bloom filter. */
  similarity(other: BloomFilter): number {
    if (this.size !== other.size) return 0;
    let overlap = 0;
    let totalBits = 0;
    for (let i = 0; i < this.bits.length; i++) {
      const a = this.bits[i]!;
      const b = other.bits[i]!;
      overlap += popcount(a & b);
      totalBits += popcount(a) + popcount(b);
    }
    return totalBits > 0 ? (2 * overlap) / totalBits : 0;
  }

  /** Export as hex string for transmission. */
  toHex(): string {
    return Buffer.from(this.bits).toString('hex');
  }

  /** Import from hex string. */
  static fromHex(hex: string, size: number, numHashes: number): BloomFilter {
    const bf = new BloomFilter(size, numHashes);
    const buf = Buffer.from(hex, 'hex');
    for (let i = 0; i < Math.min(buf.length, bf.bits.length); i++) {
      bf.bits[i] = buf[i]!;
    }
    return bf;
  }
}

/** Popcount (Hamming weight) of a byte. */
function popcount(b: number): number {
  let n = b;
  n = n - ((n >> 1) & 0x55);
  n = (n & 0x33) + ((n >> 2) & 0x33);
  return ((n + (n >> 4)) & 0x0f);
}

/**
 * Encode a field value into a Bloom filter for PPRL.
 *
 * Tokenizes the value into q-grams, then adds each q-gram
 * to the Bloom filter using salted hashing.
 */
export function encodePPRL(value: string, config: PPRLConfig): BloomFilter {
  const size = config.filterSize ?? 1024;
  const numHashes = config.numHashes ?? 15;
  const q = config.qgramSize ?? 2;

  const bf = new BloomFilter(size, numHashes);
  const normalized = value.toLowerCase().trim();

  // Generate q-grams
  for (let i = 0; i <= normalized.length - q; i++) {
    const qgram = normalized.slice(i, i + q);
    bf.add(qgram, config.secretKey);
  }

  return bf;
}

/**
 * Compare two records using PPRL-encoded Bloom filters.
 *
 * Each field value is encoded into a Bloom filter, then
 * compared using Dice coefficient on the bit vectors.
 *
 * Returns similarity in [0, 1].
 */
export function matchPPRL(
  recordA: Record<string, string>,
  recordB: Record<string, string>,
  config: PPRLConfig,
): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const field of Object.keys(recordA)) {
    if (field in recordB) {
      const bfA = encodePPRL(recordA[field]!, config);
      const bfB = encodePPRL(recordB[field]!, config);
      scores[field] = bfA.similarity(bfB);
    }
  }

  return scores;
}
