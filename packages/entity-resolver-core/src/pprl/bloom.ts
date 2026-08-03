/**
 * Privacy-Preserving Record Linkage (PPRL) — I45.
 *
 * Implements Bloom-filter-based Cryptographic Longterm Keys (CLK)
 * for private entity resolution. Supports Trusted Third Party mode
 * with HMAC-salted encoding for inter-party security.
 *
 * Reference: Schnell et al. (2009), "Privacy-preserving record
 * linkage using Bloom filters"
 */

export interface BloomFilterConfig {
  readonly ngramSize?: number;
  readonly hashFunctions?: number;
  readonly filterSize?: number;
  readonly hmacKey?: string;
}

export function tokenizeForCLK(text: string, ngramSize = 2): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const tokens: string[] = [];
  for (let i = 0; i <= normalized.length - ngramSize; i++) {
    tokens.push(normalized.slice(i, i + ngramSize));
  }
  return tokens;
}

function computeHashes(token: string, numHashes: number, filterSize: number, hmacKey?: string): number[] {
  const keyed = hmacKey ? hmacKey + ':' + token : token;
  let h1 = 2166136261;
  for (let i = 0; i < keyed.length; i++) { h1 ^= keyed.charCodeAt(i); h1 = Math.imul(h1, 16777619); }
  let h2 = 0;
  for (let i = 0; i < keyed.length; i++) { h2 = ((h2 << 5) - h2) + keyed.charCodeAt(i); h2 |= 0; }
  const hashes: number[] = [];
  for (let k = 0; k < numHashes; k++) {
    hashes.push(((Math.abs(h1) + k * Math.abs(h2)) % filterSize));
  }
  return hashes;
}

export function encodeBloomFilter(
  record: Record<string, unknown>,
  fields: readonly string[],
  config: BloomFilterConfig = {},
): string {
  const ngramSize = config.ngramSize ?? 2;
  const numHashes = config.hashFunctions ?? 15;
  const filterSize = config.filterSize ?? 1024;
  const hmacKey = config.hmacKey;
  const filterBytes = Math.ceil(filterSize / 8);
  const filter = new Uint8Array(filterBytes);

  for (const field of fields) {
    const value = String(record[field] ?? '');
    if (value === '') continue;
    for (const token of tokenizeForCLK(value, ngramSize)) {
      for (const pos of computeHashes(token, numHashes, filterSize, hmacKey)) {
        filter[Math.floor(pos / 8)]! |= 1 << (pos % 8);
      }
    }
  }
  let hex = '';
  for (const byte of filter) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export function encodeBloomFilters(
  records: readonly Record<string, unknown>[],
  fields: readonly string[],
  config: BloomFilterConfig = {},
): string[] {
  return records.map((r) => encodeBloomFilter(r, fields, config));
}

export function diceCoefficient(filterA: string, filterB: string): number {
  if (filterA.length !== filterB.length) return 0;
  let intersection = 0, popA = 0, popB = 0;
  for (let i = 0; i < filterA.length; i += 2) {
    const byteA = parseInt(filterA.slice(i, i + 2), 16);
    const byteB = parseInt(filterB.slice(i, i + 2), 16);
    if (isNaN(byteA) || isNaN(byteB)) continue;
    intersection += popcount(byteA & byteB);
    popA += popcount(byteA);
    popB += popcount(byteB);
  }
  return (popA + popB) > 0 ? (2 * intersection) / (popA + popB) : 0;
}

function popcount(n: number): number { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; }

export function diceMatrix(fA: readonly string[], fB: readonly string[]): number[][] {
  return fA.map((a) => fB.map((b) => diceCoefficient(a, b)));
}

export function estimateThreshold(
  filtersA: readonly string[],
  filtersB: readonly string[],
  sampleSize = 100,
): number {
  const scores: number[] = [];
  const n = Math.min(filtersA.length, filtersB.length);
  for (let i = 0; i < Math.min(sampleSize, n); i++) {
    scores.push(diceCoefficient(filtersA[i % filtersA.length]!, filtersB[(i + 1) % filtersB.length]!));
  }
  if (scores.length === 0) return 0.85;
  scores.sort((a, b) => a - b);
  return Math.max(0.75, Math.min(0.95, (scores[Math.floor(scores.length * 0.97)] ?? 0) + 0.05));
}

export function autoTuneFilter(avgLen: number): Required<BloomFilterConfig> {
  if (avgLen < 8) return { ngramSize: 2, filterSize: 512, hashFunctions: 15, hmacKey: undefined };
  if (avgLen < 20) return { ngramSize: 2, filterSize: 1024, hashFunctions: 20, hmacKey: undefined };
  return { ngramSize: 3, filterSize: 2048, hashFunctions: 25, hmacKey: undefined };
}

export function averageFieldLength(
  records: readonly Record<string, unknown>[],
  fields: readonly string[],
): number {
  if (records.length === 0 || fields.length === 0) return 0;
  let total = 0, count = 0;
  for (const r of records) {
    for (const f of fields) { total += (String(r[f] ?? '')).length; count++; }
  }
  return count > 0 ? total / count : 0;
}
