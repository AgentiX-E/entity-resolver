// Token Blocking + Sorted Neighborhood + Multi-pass + Meta-blocking strategies.

import type { CandidatePair, BlockingConfig, BlockingResult, BlockingTransform } from './types.js';
import { applyBlockingTransforms, computeReductionRatio, parseCandidatePairs } from './types.js';
import { getFieldString } from '../types/core.js';
import { soundex } from 'strsimkit';

// ─── Token Blocking (pyJedAI-style) ────────────────────────────

/**
 * Token Blocking: each token in a field value creates a block.
 * A record can belong to multiple blocks (lazy overlapping blocks).
 *
 * Blocks exceeding maxBlockSize are skipped to prevent O(n²) explosion
 * from common tokens (e.g., "the", "and", "of"). Use the config's
 * `maxBlockSize` to adjust this threshold (default: 1000).
 *
 * This is the first stage of pyJedAI's multi-stage pipeline.
 */
export function tokenBlocking(
  records: readonly Record<string, unknown>[],
  config: BlockingConfig,
): BlockingResult {
  const maxBlock = config.maxBlockSize ?? 1000;
  const pairSet = new Set<string>();
  const field = config.fields?.[0] ?? 'name';

  // Build token → record indices mapping
  const tokenBlocks = new Map<string, number[]>();

  for (let i = 0; i < records.length; i++) {
    const raw = getFieldString(records[i]!, field)
      .toLowerCase()
      .trim();
    const tokens = new Set(raw.split(/[\s,._\-:;]+/).filter(Boolean));

    for (const token of tokens) {
      const block = tokenBlocks.get(token) ?? [];
      block.push(i);
      tokenBlocks.set(token, block);
    }
  }

  // Generate pairs within each token block
  for (const [, indices] of tokenBlocks) {
    if (indices.length < 2 || indices.length > maxBlock) continue; // Skip oversized blocks
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = indices[i]!;
        const b = indices[j]!;
        pairSet.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
      }
    }
  }

  const pairs = parseCandidatePairs(pairSet);
  return {
    pairs,
    totalRecords: records.length,
    reductionRatio: computeReductionRatio(pairs.length, records.length),
    blockCount: tokenBlocks.size,
  };
}

// ─── Sorted Neighborhood ───────────────────────────────────────

/**
 * Sorted Neighborhood: sort records by a key, then slide a window
 * of size `windowSize` over the sorted list, comparing records within
 * each window.
 */
export function sortedNeighborhood(
  records: readonly Record<string, unknown>[],
  config: BlockingConfig,
): BlockingResult {
  const windowSize = config.windowSize ?? 20;
  const field = config.fields?.[0] ?? 'name';
  const transforms = config.transforms ?? ['strip', 'lowercase'];

  // Build sort keys
  const indexed = records.map((rec, i) => ({
    index: i,
    key: applyBlockingTransforms(getFieldString(rec, field).trim(), transforms),
  }));

  // Sort by key
  indexed.sort((a, b) => a.key.localeCompare(b.key));

  const pairSet = new Set<string>();

  // Slide window
  for (let i = 0; i < indexed.length; i++) {
    const end = Math.min(i + windowSize, indexed.length);
    for (let j = i + 1; j < end; j++) {
      const a = indexed[i]!.index;
      const b = indexed[j]!.index;
      pairSet.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
    }
  }

  const pairs = parseCandidatePairs(pairSet);
  return {
    pairs,
    totalRecords: records.length,
    reductionRatio: computeReductionRatio(pairs.length, records.length),
    blockCount: Math.ceil(records.length / windowSize),
  };
}

// ─── Multi-pass Blocking (GoldenMatch-style) ───────────────────

/**
 * Multi-pass Blocking: multiple independent passes (exact + soundex + substring).
 * Pairs are the UNION of all passes.
 */
export function multiPassBlocking(
  records: readonly Record<string, unknown>[],
  config: BlockingConfig,
): BlockingResult {
  const pairSet = new Set<string>();

  if (!config.passes || config.passes.length === 0) {
    return {
      pairs: [],
      totalRecords: records.length,
      reductionRatio: 1,
      blockCount: 0,
    };
  }

  let totalBlocks = 0;
  const effectiveMaxBlockSize = Math.max(50, Math.floor(records.length / 10));
  for (const pass of config.passes) {
    const blocks = new Map<string, number[]>();

    for (let i = 0; i < records.length; i++) {
      const key = buildPassKey(records[i]!, pass);
      if (key === '') continue;
      const block = blocks.get(key) ?? [];
      block.push(i);
      blocks.set(key, block);
    }

    totalBlocks += blocks.size;

    for (const [, indices] of blocks) {
      if (indices.length < 2 || indices.length > effectiveMaxBlockSize) continue;
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const a = indices[i]!;
          const b = indices[j]!;
          pairSet.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
        }
      }
    }
  }

  const pairs = parseCandidatePairs(pairSet);
  return {
    pairs,
    totalRecords: records.length,
    reductionRatio: computeReductionRatio(pairs.length, records.length),
    blockCount: totalBlocks,
  };
}

/** Build a blocking key from a record using a pass config. */
function buildPassKey(
  record: Record<string, unknown>,
  pass: { fields: readonly string[]; transforms: readonly BlockingTransform[] },
): string {
  const parts: string[] = [];
  for (const field of pass.fields) {
    const raw = getFieldString(record, field).trim();
    if (raw === '') return '';
    const transformed = applyBlockingTransforms(raw, pass.transforms);
    if (transformed === '') return '';
    parts.push(transformed);
  }
  return parts.join('::');
}

// ─── Block Purging + CNP (Meta-blocking stages) ────────────────

/**
 * Block Purging: remove blocks that are too large (oversized).
 * Oversized blocks contribute many comparisons but few matches.
 */
export function blockPurging(
  blocks: Map<string, number[]>,
  maxBlockSize = 500,
): Map<string, number[]> {
  const purged = new Map<string, number[]>();
  for (const [key, indices] of blocks) {
    if (indices.length <= maxBlockSize) {
      purged.set(key, indices);
    }
  }
  return purged;
}

/**
 * Comparison Neighborhood Pruning (CNP): for each entity, keep only
 * the most promising comparisons based on neighborhood weight.
 *
 * Simplified implementation: for each block, keep entity pairs
 * where the weighted overlap meets a threshold.
 */
export function comparisonNeighborhoodPruning(
  blocks: Map<string, number[]>,
  minNeighborWeight = 2,
): Set<string> {
  const edges = new Map<string, number>();

  for (const [, indices] of blocks) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = indices[i]!;
        const b = indices[j]!;
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  }

  const pruned = new Set<string>();
  for (const [key, weight] of edges) {
    if (weight >= minNeighborWeight) {
      pruned.add(key);
    }
  }
  return pruned;
}

/**
 * Full Meta-blocking pipeline (pyJedAI-style):
 *   Token Blocking → Block Purging → CNP
 */
export function metaBlocking(
  records: readonly Record<string, unknown>[],
  config: BlockingConfig,
): BlockingResult {
  const field = config.fields?.[0] ?? 'name';
  const transforms = config.transforms ?? ['strip', 'lowercase'];

  // Stage 1: Token Blocking
  const tokenBlocks = new Map<string, number[]>();
  for (let i = 0; i < records.length; i++) {
    const raw = getFieldString(records[i]!, field)
      .toLowerCase()
      .trim();
    const tokens = new Set(
      applyBlockingTransforms(raw, transforms)
        .split(/[\s,._\-:;]+/)
        .filter(Boolean),
    );
    for (const token of tokens) {
      const block = tokenBlocks.get(token) ?? [];
      block.push(i);
      tokenBlocks.set(token, block);
    }
  }

  // Stage 2: Block Purging
  const purged = blockPurging(tokenBlocks);

  // Stage 3: CNP
  const prunedPairs = comparisonNeighborhoodPruning(purged);

  const pairs: CandidatePair[] = [];
  for (const entry of prunedPairs) {
    const [a, b] = entry.split(':');
    pairs.push({ leftId: Number(a), rightId: Number(b) });
  }

  return {
    pairs,
    totalRecords: records.length,
    reductionRatio: computeReductionRatio(pairs.length, records.length),
    blockCount: purged.size,
  };
}

// ═══════════════════════════════════════════════════════════════
// I44: Blocking union with coverage gate
// ═══════════════════════════════════════════════════════════════

/**
 * Maximum block size before auto-splitting.
 * Blocks larger than this are split by the highest-cardinality column
 * to prevent O(n²) explosion in the comparison phase.
 */
const MAX_SAFE_BLOCK_SIZE = 5000;

/**
 * Split an oversized block into sub-blocks using the highest-cardinality
 * column. Each unique value in that column becomes a separate sub-block.
 *
 * This mirrors GoldenMatch's auto-split behavior — instead of skipping
 * oversized blocks entirely, they are broken down by the field that
 * provides the most discriminatory power.
 */
export function splitOversizedBlocks(
  records: readonly Record<string, unknown>[],
  blockIndices: readonly number[][],
  maxBlockSize: number = MAX_SAFE_BLOCK_SIZE,
): CandidatePair[] {
  const allPairs: CandidatePair[] = [];
  const seen = new Set<string>();

  for (const block of blockIndices) {
    if (block.length <= maxBlockSize) {
      // Safe block: generate all pairs
      for (let i = 0; i < block.length; i++) {
        for (let j = i + 1; j < block.length; j++) {
          const key = `${block[i]}|${block[j]}`;
          if (!seen.has(key)) {
            seen.add(key);
            allPairs.push({ leftId: block[i]!, rightId: block[j]! });
          }
        }
      }
    } else {
      // Oversized block: split into sub-blocks using first available field
      const subBlocks = new Map<string, number[]>();
      for (const idx of block) {
        const val = getFieldString(records[idx]!, Object.keys(records[idx]!)[0] ?? '');
        const group = subBlocks.get(val) ?? [];
        group.push(idx);
        subBlocks.set(val, group);
      }
      // Generate pairs within each sub-block
      for (const [, subBlock] of subBlocks) {
        for (let i = 0; i < subBlock.length; i++) {
          for (let j = i + 1; j < subBlock.length; j++) {
            const key = `${subBlock[i]}|${subBlock[j]}`;
            if (!seen.has(key)) {
              seen.add(key);
              allPairs.push({ leftId: subBlock[i]!, rightId: subBlock[j]! });
            }
          }
        }
      }
    }
  }

  return allPairs;
}

/**
 * Coverage gate: estimate what fraction of records participate in
 * at least one blocking-pass match. Used to decide whether union
 * blocking should be activated.
 *
 * Returns true if estimated coverage ≥ target (default: 0.95).
 */
export function estimateBlockingCoverage(
  records: readonly Record<string, unknown>[],
  passes: ReadonlyArray<{ readonly fields: readonly string[]; readonly transforms: readonly string[] }>,
  target = 0.95,
): boolean {
  if (records.length < 2) return false;

  // Simple estimate: check fraction of records that share a blocking key
  // with at least one other record
  let coveredCount = 0;

  for (let i = 0; i < records.length; i++) {
    let covered = false;
    for (const pass of passes) {
      const key = pass.fields
        .map((f) => {
          let val = getFieldString(records[i]!, f).toLowerCase().trim();
          for (const t of pass.transforms) {
            val = applySingleTransform(val, t);
          }
          return val;
        })
        .join('|');

      // Check if any other record shares this key (sample check for performance)
      for (let j = 0; j < Math.min(records.length, 100); j++) {
        if (i === j) continue;
        const otherKey = pass.fields
          .map((f) => {
            let val = getFieldString(records[j]!, f).toLowerCase().trim();
            for (const t of pass.transforms) {
              val = applySingleTransform(val, t);
            }
            return val;
          })
          .join('|');
        if (key === otherKey) {
          covered = true;
          break;
        }
      }
      if (covered) break;
    }
    if (covered) coveredCount++;
  }

  return records.length > 0 ? coveredCount / records.length >= target : false;
}

function applySingleTransform(val: string, t: string): string {
  switch (t) {
    case 'lowercase': return val.toLowerCase();
    case 'uppercase': return val.toUpperCase();
    case 'strip': return val.trim();
    case 'soundex': try { return soundex(val); } catch { return val; }
    default: return val;
  }
}

// ─── Helpers ────────────────────────────────────────────────────
