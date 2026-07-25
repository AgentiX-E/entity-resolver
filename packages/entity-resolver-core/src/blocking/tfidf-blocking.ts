/**
 * TF-IDF / BM25-based blocking for entity resolution.
 *
 * Splink-style intelligent blocking: instead of exact-match blocking keys
 * (which miss many true matches), we tokenize fields, compute token
 * importance via inverse document frequency, and use the most
 * discriminating tokens as blocking keys.
 *
 * Why this matters:
 * - "John Smith, New York" and "Smith, John; NYC" won't block on
 *   [{fields: ["name", "city"]}] because the combined key is different.
 * - TF-IDF blocking tokenizes: "john", "smith", "new", "york" for both,
 *   blocks on "york" (high IDF token), and captures the match.
 *
 * Two algorithms:
 * 1. TF-IDF blocking: uses IDF-weighted token selection
 * 2. BM25 scoring: Okapi BM25 for ranking candidate pair relevance
 */

import type { CandidatePair, BlockingResult } from './types.js';
import { computeReductionRatio } from './types.js';

/** Tokenize a string into normalized tokens. */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Compute IDF scores for a corpus of token lists. */
function computeIDF(
  tokenizedRecords: string[][],
): Map<string, number> {
  const N = tokenizedRecords.length;
  const df = new Map<string, number>();

  for (const tokens of tokenizedRecords) {
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!seen.has(t)) {
        df.set(t, (df.get(t) ?? 0) + 1);
        seen.add(t);
      }
    }
  }

  const idf = new Map<string, number>();
  for (const [token, docFreq] of df) {
    // Smooth IDF: log((N + 1) / (df + 1))
    idf.set(token, Math.log((N + 1) / (docFreq + 1)));
  }
  return idf;
}

/** Compute BM25 score between two token lists. */
export function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  idf: Map<string, number>,
  avgDocLen: number,
  k1: number = 1.2,
  b: number = 0.75,
): number {
  const docLen = docTokens.length;
  let score = 0;

  // Count term frequencies in doc
  const docTF = new Map<string, number>();
  for (const t of docTokens) {
    docTF.set(t, (docTF.get(t) ?? 0) + 1);
  }

  for (const t of new Set(queryTokens)) {
    const tf = docTF.get(t) ?? 0;
    if (tf === 0) continue;
    const idfVal = idf.get(t) ?? 0;
    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLen / Math.max(1, avgDocLen)));
    score += idfVal * numerator / denominator;
  }

  return score;
}

/** Configuration for TF-IDF blocking. */
export interface TfIdfBlockingConfig {
  /** Fields to tokenize for blocking. */
  readonly fields: readonly string[];
  /** Number of top-IDF tokens to use per record. Default: 3. */
  readonly topK?: number;
  /** Minimum token length to consider. Default: 2. */
  readonly minTokenLength?: number;
}

/**
 * TF-IDF based blocking.
 *
 * For each record:
 * 1. Tokenize all specified fields
 * 2. Select the top-K highest-IDF tokens
 * 3. Block records that share any of these high-IDF tokens
 *
 * This produces significantly more true-match candidates than
 * exact-key blocking, at the cost of more candidate pairs.
 *
 * @param records — entity records
 * @param config — TF-IDF blocking configuration
 * @returns BlockingResult with candidate pairs
 */
export function tfidfBlocking(
  records: readonly Record<string, unknown>[],
  config: TfIdfBlockingConfig,
): BlockingResult {
  const totalRecords = records.length;
  const topK = config.topK ?? 3;
  const minLen = config.minTokenLength ?? 2;

  if (totalRecords === 0 || config.fields.length === 0) {
    return { pairs: [], totalRecords, reductionRatio: 1, blockCount: 0 };
  }

  // Step 1: Tokenize all records
  const tokenized: string[][] = [];
  for (const rec of records) {
    const allTokens: string[] = [];
    for (const field of config.fields) {
      const value = String(rec[field] ?? '');
      allTokens.push(...tokenize(value));
    }
    tokenized.push(allTokens.filter((t) => t.length >= minLen));
  }

  // Step 2: Compute IDF
  const idf = computeIDF(tokenized);

  // Step 3: Select top-K tokens per record by IDF
  const topTokens: string[][] = [];
  for (const tokens of tokenized) {
    const sorted = [...new Set(tokens)].sort(
      (a, b) => (idf.get(b) ?? 0) - (idf.get(a) ?? 0),
    );
    topTokens.push(sorted.slice(0, topK));
  }

  // Step 4: Build inverted index (token → record indices)
  const index = new Map<string, number[]>();
  for (let i = 0; i < topTokens.length; i++) {
    for (const token of topTokens[i]!) {
      const list = index.get(token) ?? [];
      list.push(i);
      index.set(token, list);
    }
  }

  // Step 5: Generate candidate pairs within each token's block
  const pairSet = new Set<string>();
  for (const [, indices] of index) {
    if (indices.length < 2) continue;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = indices[i]!;
        const b = indices[j]!;
        pairSet.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
      }
    }
  }

  const pairs: CandidatePair[] = [];
  for (const entry of pairSet) {
    const [left, right] = entry.split(':');
    pairs.push({ leftId: Number(left), rightId: Number(right) });
  }

  const reductionRatio = computeReductionRatio(pairs.length, totalRecords);

  return { pairs, totalRecords, reductionRatio, blockCount: pairSet.size };
}

/**
 * Compute average document length (for BM25).
 */
export function computeAvgDocLen(
  records: readonly Record<string, unknown>[],
  fields: readonly string[],
): number {
  let total = 0;
  for (const rec of records) {
    for (const field of fields) {
      total += tokenize(String(rec[field] ?? '')).length;
    }
  }
  return records.length > 0 ? total / records.length : 0;
}
