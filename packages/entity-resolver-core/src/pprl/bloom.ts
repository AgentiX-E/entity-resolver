// Privacy-Preserving Record Linkage (PPRL) — Bloom filter encoding.
// Enables entity matching without exposing raw PII.
// Uses Bloom filters to encode field values into bit vectors for private comparison.
//
// Cross-platform hashing strategy:
//   - Node.js:   sha256Sync → crypto.createHash('sha256') (synchronous, fast)
//   - Browser:   sha256Async → Web Crypto subtle.digest('SHA-256') (async only)
//   - Fallback:  simpleHash → FNV-1a (non-crypto, Bloom filter use only)
//
// IMPORTANT: sha256Sync() is Node.js ONLY. For browser PPRL, use
// encodePPRLAsync() / matchPPRLAsync() which internally use sha256Async().

import { createHash as nodeCreateHash } from 'crypto';

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

// ─── Cross-platform SHA-256 ──────────────────────────────────────

/**
 * Compute SHA-256 hash synchronously using Node.js crypto module.
 * Node.js ONLY — throws in browser environments (no sync Web Crypto).
 * Use sha256Async() for browser PPRL support.
 */
export function sha256Sync(input: string): Uint8Array {
  try {
    const hash = nodeCreateHash('sha256').update(input).digest();
    return new Uint8Array(hash);
  } catch {
    // In browser-like environments, Node crypto is unavailable.
    // Fall back to simple FNV-1a hash (not cryptographically secure,
    // but sufficient for Bloom filter bit distribution).
    return simpleHash(input);
  }
}

/**
 * Compute SHA-256 hash using Web Crypto API (async — for browser use).
 * Falls back to Node.js crypto or simple FNV-1a hash.
 */
export async function sha256Async(input: string): Promise<Uint8Array> {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
      return new Uint8Array(hashBuffer);
    }
  } catch {
    // Web Crypto may throw in restricted contexts (e.g., non-HTTPS).
  }
  // Fallback: Node.js crypto or simple hash
  return sha256Sync(input);
}

/** Simple non-crypto hash for environments without crypto. */
function simpleHash(input: string): Uint8Array {
  const buf = new Uint8Array(32);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  // Spread hash across 32 bytes via multiple rounds
  for (let i = 0; i < 32; i++) {
    buf[i] = (h >>> ((i % 4) * 8)) & 0xff;
    h = Math.imul(h ^ (i + 1), 0x01000193);
  }
  return buf;
}

// ─── Bloom Filter ─────────────────────────────────────────────────

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

  /** Add a token to the Bloom filter (synchronous — uses best available hash). */
  add(token: string, secret: string): void {
    const hashInput = `${secret}:${token}`;
    for (let i = 0; i < this.numHashes; i++) {
      const hash = sha256Sync(`${i}:${hashInput}`);
      const pos = readUInt32BE(hash, i % 28) % this.size;
      const byteIdx = Math.floor(pos / 8);
      const bitIdx = pos % 8;
      this.bits[byteIdx]! |= 1 << bitIdx;
    }
  }

  /**
   * Add a token using async SHA-256 (for browser environments).
   * Call this instead of `add` when using Web Crypto API.
   */
  async addAsync(token: string, secret: string): Promise<void> {
    const hashInput = `${secret}:${token}`;
    for (let i = 0; i < this.numHashes; i++) {
      const hash = await sha256Async(`${i}:${hashInput}`);
      const pos = readUInt32BE(hash, i % 28) % this.size;
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
    // Cross-platform hex encoding (no Buffer dependency)
    let hex = '';
    for (const byte of this.bits) {
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  }

  /** Import from hex string. */
  static fromHex(hex: string, size: number, numHashes: number): BloomFilter {
    const bf = new BloomFilter(size, numHashes);
    const len = Math.min(Math.floor(hex.length / 2), bf.bits.length);
    for (let i = 0; i < len; i++) {
      bf.bits[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bf;
  }

  /** Serialize to a compact base64 string. */
  toBase64(): string {
    // Cross-platform Base64: use btoa (browser) or Buffer (Node.js)
    let binary = '';
    for (const byte of this.bits) {
      binary += String.fromCharCode(byte);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(binary, 'binary').toString('base64');
    }
    if (typeof btoa === 'function') {
      return btoa(binary);
    }
    // Pure JS fallback: manual Base64 encoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    for (let i = 0; i < binary.length; i += 3) {
      const a = binary.charCodeAt(i);
      const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
      const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
      const t = (a << 16) | (b << 8) | c;
      result += chars.charAt((t >> 18) & 63);
      result += chars.charAt((t >> 12) & 63);
      result += i + 1 < binary.length ? chars.charAt((t >> 6) & 63) : '=';
      result += i + 2 < binary.length ? chars.charAt(t & 63) : '=';
    }
    return result;
  }

  /** Deserialize from a base64 string. */
  static fromBase64(b64: string, size: number, numHashes: number): BloomFilter {
    const bf = new BloomFilter(size, numHashes);
    let binary: string;
    if (typeof Buffer !== 'undefined') {
      binary = Buffer.from(b64, 'base64').toString('binary');
    } else if (typeof atob === 'function') {
      binary = atob(b64);
    } else {
      // Pure JS fallback: manual Base64 decoding
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const lookup = new Map<string, number>();
      for (let i = 0; i < chars.length; i++) lookup.set(chars[i]!, i);
      binary = '';
      for (let i = 0; i < b64.length; i += 4) {
        const a = lookup.get(b64[i]!) ?? 0;
        const b = lookup.get(b64[i + 1]!) ?? 0;
        const c = lookup.get(b64[i + 2]!) ?? 0;
        const d = lookup.get(b64[i + 3]!) ?? 0;
        binary += String.fromCharCode((a << 2) | (b >> 4));
        if (b64[i + 2] !== '=') binary += String.fromCharCode(((b & 15) << 4) | (c >> 2));
        if (b64[i + 3] !== '=') binary += String.fromCharCode(((c & 3) << 6) | d);
      }
    }
    const len = Math.min(binary.length, bf.bits.length);
    for (let i = 0; i < len; i++) {
      bf.bits[i] = binary.charCodeAt(i);
    }
    return bf;
  }
}

// ─── Utilities ────────────────────────────────────────────────────

/** Popcount (Hamming weight) of a byte using well-known bit-hack. */
function popcount(b: number): number {
  let n = b;
  n = n - ((n >> 1) & 0x55);
  n = (n & 0x33) + ((n >> 2) & 0x33);
  return (n + (n >> 4)) & 0x0f;
}

/** Read a big-endian uint32 from a byte array at offset (with wrap). */
function readUInt32BE(buf: Uint8Array, offset: number): number {
  const o = offset % (buf.length - 3);
  return ((buf[o]! << 24) | (buf[o + 1]! << 16) | (buf[o + 2]! << 8) | buf[o + 3]!) >>> 0;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Encode a field value into a Bloom filter for PPRL (synchronous).
 */
export function encodePPRL(value: string, config: PPRLConfig): BloomFilter {
  const size = config.filterSize ?? 1024;
  const numHashes = config.numHashes ?? 15;
  const q = config.qgramSize ?? 2;

  const bf = new BloomFilter(size, numHashes);
  const normalized = value.toLowerCase().trim();

  for (let i = 0; i <= normalized.length - q; i++) {
    const qgram = normalized.slice(i, i + q);
    bf.add(qgram, config.secretKey);
  }

  return bf;
}

/**
 * Encode a field value into a Bloom filter (async — for browser).
 */
export async function encodePPRLAsync(value: string, config: PPRLConfig): Promise<BloomFilter> {
  const size = config.filterSize ?? 1024;
  const numHashes = config.numHashes ?? 15;
  const q = config.qgramSize ?? 2;

  const bf = new BloomFilter(size, numHashes);
  const normalized = value.toLowerCase().trim();

  for (let i = 0; i <= normalized.length - q; i++) {
    const qgram = normalized.slice(i, i + q);
    await bf.addAsync(qgram, config.secretKey);
  }

  return bf;
}

/**
 * Compare two records using PPRL-encoded Bloom filters.
 *
 * Each field value is encoded into a Bloom filter, then
 * compared using Dice coefficient on the bit vectors.
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

/**
 * Compare two records using async PPRL encoding (for browser).
 */
export async function matchPPRLAsync(
  recordA: Record<string, string>,
  recordB: Record<string, string>,
  config: PPRLConfig,
): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};

  for (const field of Object.keys(recordA)) {
    if (field in recordB) {
      const bfA = await encodePPRLAsync(recordA[field]!, config);
      const bfB = await encodePPRLAsync(recordB[field]!, config);
      scores[field] = bfA.similarity(bfB);
    }
  }

  return scores;
}
