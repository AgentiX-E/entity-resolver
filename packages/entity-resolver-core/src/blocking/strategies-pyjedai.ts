/**
 * pyJedAI-style advanced blocking strategies.
 *
 * Ported from pyJedAI (University of Athens) — Python → TypeScript.
 * All strategies operate on Record<string, unknown> and return candidate
 * pairs in the standard BlockingResult format.
 */

import type { CandidatePair, BlockingResult } from './types.js';
import { computeReductionRatio } from './types.js';

// ══════════════════════════════════════════════════════════════
// Shared helpers
// ══════════════════════════════════════════════════════════════

/** Extract string tokens from a record's fields by splitting on non-word chars. */
function tokenizeRecord(
  record: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  const tokens: string[] = [];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) {
      tokens.push(...value.split(/[\W_]+/).filter((t) => t.length > 0));
    }
  }
  return tokens;
}

/** Generate all suffixes of a token of minimum length. */
function suffixes(token: string, minLength: number): string[] {
  if (token.length < minLength) return [token];
  const result: string[] = [];
  for (let i = 0; i <= token.length - minLength; i++) {
    result.push(token.slice(i));
  }
  return result;
}

/** Generate all substrings (ngrams) of a token in the given size range. */
function ngrams(token: string, minSize: number, maxSize?: number): string[] {
  const result: string[] = [];
  const max = maxSize ?? token.length;
  for (let size = minSize; size <= Math.min(max, token.length); size++) {
    for (let i = 0; i <= token.length - size; i++) {
      result.push(token.slice(i, i + size));
    }
  }
  return result;
}

/** Drop blocks that exceed the maximum size. */
function dropBigBlocks(
  blocks: Map<string, number[]>,
  maxSize: number,
): Map<string, number[]> {
  const filtered = new Map<string, number[]>();
  for (const [key, entities] of blocks) {
    if (entities.length <= maxSize) {
      filtered.set(key, entities);
    }
  }
  return filtered;
}

/** Build candidate pairs from block map. */
function blocksToPairs(
  blocks: Map<string, number[]>,
): CandidatePair[] {
  const pairSet = new Set<string>();
  const pairs: CandidatePair[] = [];

  for (const [, entities] of blocks) {
    for (let i = 0; i < entities.length; i++) {
      const a = entities[i]!;
      for (let j = i + 1; j < entities.length; j++) {
        const b = entities[j]!;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!pairSet.has(key)) {
          pairSet.add(key);
          pairs.push({ leftId: a, rightId: b });
        }
      }
    }
  }

  return pairs;
}

// ══════════════════════════════════════════════════════════════
// 1. Suffix Arrays Blocking
// ══════════════════════════════════════════════════════════════

export interface SuffixArraysConfig {
  readonly fields?: readonly string[];
  /** Minimum suffix length. Default: 6. */
  readonly suffixLength?: number;
  /** Maximum block size (drops oversized blocks). Default: 53. */
  readonly maxBlockSize?: number;
}

/**
 * Creates one block for every suffix that appears in the attribute value
 * tokens of at least two entities.
 *
 * Blocks larger than maxBlockSize are dropped to prevent excessive comparisons.
 */
export function suffixArraysBlocking(
  records: ReadonlyArray<Record<string, unknown>>,
  config: SuffixArraysConfig = {},
): BlockingResult {
  const fields = config.fields ?? Object.keys(records[0] ?? {});
  const suffixLen = config.suffixLength ?? 6;
  const maxBlockSize = config.maxBlockSize ?? 53;

  const blocks = new Map<string, number[]>();

  for (let id = 0; id < records.length; id++) {
    const record = records[id]!;
    const tokens = tokenizeRecord(record, fields);
    const seen = new Set<string>(); // per-record dedup

    for (const token of tokens) {
      for (const suff of suffixes(token, suffixLen)) {
        if (!seen.has(suff)) {
          seen.add(suff);
          const key = suff.toLowerCase();
          if (!blocks.has(key)) blocks.set(key, []);
          blocks.get(key)!.push(id);
        }
      }
    }
  }

  // Drop oversized blocks and singleton blocks
  const filtered = dropBigBlocks(blocks, maxBlockSize);
  // Also drop blocks with < 2 entities
  for (const [key, entities] of filtered) {
    if (entities.length < 2) filtered.delete(key);
  }

  const pairs = blocksToPairs(filtered);
  const resultPairs = pairs;
  const total = records.length;
  const totalPossible = (total * (total - 1)) / 2;
  return { pairs: resultPairs, blockCount: filtered.size, totalRecords: total, reductionRatio: computeReductionRatio(resultPairs.length, totalPossible) };
}

// ══════════════════════════════════════════════════════════════
// 2. Extended Suffix Arrays Blocking
// ══════════════════════════════════════════════════════════════

export interface ExtendedSuffixArraysConfig {
  readonly fields?: readonly string[];
  /** Minimum ngram length. Default: 6. */
  readonly minLength?: number;
  /** Maximum block size. Default: 39. */
  readonly maxBlockSize?: number;
}

/**
 * Creates one block for every substring (not just suffix) that appears
 * in the tokens of at least two entities.
 */
export function extendedSuffixArraysBlocking(
  records: ReadonlyArray<Record<string, unknown>>,
  config: ExtendedSuffixArraysConfig = {},
): BlockingResult {
  const fields = config.fields ?? Object.keys(records[0] ?? {});
  const minLen = config.minLength ?? 6;
  const maxBlockSize = config.maxBlockSize ?? 39;

  const blocks = new Map<string, number[]>();

  for (let id = 0; id < records.length; id++) {
    const record = records[id]!;
    const tokens = tokenizeRecord(record, fields);
    const seen = new Set<string>();

    for (const token of tokens) {
      // Add the full token
      const key = token.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        if (!blocks.has(key)) blocks.set(key, []);
        blocks.get(key)!.push(id);
      }

      // Add all substrings >= minLength
      if (token.length > minLen) {
        for (const ngram of ngrams(token, minLen, token.length)) {
          const nkey = ngram.toLowerCase();
          if (!seen.has(nkey)) {
            seen.add(nkey);
            if (!blocks.has(nkey)) blocks.set(nkey, []);
            blocks.get(nkey)!.push(id);
          }
        }
      }
    }
  }

  const filtered = dropBigBlocks(blocks, maxBlockSize);
  for (const [key, entities] of filtered) {
    if (entities.length < 2) filtered.delete(key);
  }

  const pairs = blocksToPairs(filtered);
  const resultPairs = pairs;
  const total = records.length;
  const totalPossible = (total * (total - 1)) / 2;
  return { pairs: resultPairs, blockCount: filtered.size, totalRecords: total, reductionRatio: computeReductionRatio(resultPairs.length, totalPossible) };
}

// ══════════════════════════════════════════════════════════════
// 3. Extended QGrams Blocking
// ══════════════════════════════════════════════════════════════

export interface ExtendedQGramsConfig {
  readonly fields?: readonly string[];
  /** Q-gram size. Default: 6. */
  readonly qgrams?: number;
  /**
   * Threshold for q-gram combination generation.
   * At each recursive level, generates q-gram combinations
   * with cumulative proportion >= threshold. Default: 0.95.
   */
  readonly threshold?: number;
  /** Maximum number of q-gram combinations per entity. Default: 15. */
  readonly maxCombinations?: number;
}

/**
 * Extended QGrams Blocking — creates blocks from combinations of q-grams.
 *
 * For each entity's tokens, generates q-grams and recursively combines them
 * up to maxCombinations. The threshold controls the proportion of q-gram
 * combinations to use (higher = fewer blocks, lower = more recall).
 */
export function extendedQGramsBlocking(
  records: ReadonlyArray<Record<string, unknown>>,
  config: ExtendedQGramsConfig = {},
): BlockingResult {
  const fields = config.fields ?? Object.keys(records[0] ?? {});
  const q = config.qgrams ?? 6;
  const threshold = config.threshold ?? 0.95;
  const maxCombos = config.maxCombinations ?? 15;

  const blocks = new Map<string, number[]>();

  for (let id = 0; id < records.length; id++) {
    const record = records[id]!;
    const tokens = tokenizeRecord(record, fields);

    // Generate q-grams from all tokens
    const allQGrams: string[] = [];
    for (const token of tokens) {
      for (let i = 0; i <= token.length - q; i++) {
        allQGrams.push(token.slice(i, i + q).toLowerCase());
      }
    }

    // Deduplicate
    const uniqueQGrams = [...new Set(allQGrams)].sort();
    if (uniqueQGrams.length === 0) continue;

    // Generate combinations of q-grams as blocking keys
    const numToGenerate = Math.min(maxCombos, uniqueQGrams.length);
    const combos = generateQGramCombinations(
      uniqueQGrams,
      numToGenerate,
      threshold,
    );

    for (const combo of combos) {
      const key = combo.join('|');
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key)!.push(id);
    }
  }

  // Keep only blocks with >= 2 entities (no max block size for EQGB)
  for (const [key, entities] of blocks) {
    if (entities.length < 2) blocks.delete(key);
  }

  const pairs = blocksToPairs(blocks);
  const resultPairs = pairs;
  const total = records.length;
  const totalPossible = (total * (total - 1)) / 2;
  return { pairs: resultPairs, blockCount: blocks.size, totalRecords: total, reductionRatio: computeReductionRatio(resultPairs.length, totalPossible) };
}

/**
 * Generate q-gram combinations recursively.
 *
 * Starts with individual q-grams, then recursively generates
 * combinations until proportion >= threshold or max count reached.
 */
function generateQGramCombinations(
  qgrams: string[],
  maxCount: number,
  threshold: number,
): string[][] {
  const results: string[][] = [];

  // Level 0: individual q-grams
  for (const qg of qgrams) {
    results.push([qg]);
  }

  // Level 1+: combinations
  let level = 1;
  while (results.length < maxCount && level < qgrams.length) {
    const newCombos: string[][] = [];
    for (let i = 0; i < qgrams.length - level; i++) {
      const combo = qgrams.slice(i, i + level + 1);
      // Stop when cumulative proportion exceeds threshold
      if ((results.length + newCombos.length) / maxCount >= threshold) break;
      newCombos.push(combo);
    }
    results.push(...newCombos);
    level++;
  }

  return results.slice(0, maxCount);
}
