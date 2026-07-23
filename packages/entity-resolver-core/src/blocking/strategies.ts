// Token Blocking + Sorted Neighborhood + Multi-pass + Meta-blocking strategies.

import type { CandidatePair, BlockingConfig, BlockingResult } from './types.js';
import { applyBlockingTransforms, computeReductionRatio } from './types.js';

// ─── Token Blocking (pyJedAI-style) ────────────────────────────

/**
 * Token Blocking: each token in a field value creates a block.
 * A record can belong to multiple blocks (lazy overlapping blocks).
 *
 * This is the first stage of pyJedAI's multi-stage pipeline.
 */
export function tokenBlocking(
  records: ReadonlyArray<Record<string, unknown>>,
  config: BlockingConfig,
): BlockingResult {
  const pairSet = new Set<string>();
  const field = config.fields?.[0] ?? 'name';

  // Build token → record indices mapping
  const tokenBlocks = new Map<string, number[]>();

  for (let i = 0; i < records.length; i++) {
    const raw = String(records[i]![field] ?? '')
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
    if (indices.length < 2 || indices.length > 1000) continue; // Skip oversized blocks
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = indices[i]!;
        const b = indices[j]!;
        pairSet.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
      }
    }
  }

  const pairs = parsePairs(pairSet);
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
  records: ReadonlyArray<Record<string, unknown>>,
  config: BlockingConfig,
): BlockingResult {
  const windowSize = config.windowSize ?? 20;
  const field = config.fields?.[0] ?? 'name';
  const transforms = config.transforms ?? ['strip', 'lowercase'];

  // Build sort keys
  const indexed = records.map((rec, i) => ({
    index: i,
    key: applyBlockingTransforms(String(rec[field] ?? '').trim(), transforms),
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

  const pairs = parsePairs(pairSet);
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
  records: ReadonlyArray<Record<string, unknown>>,
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

  for (const pass of config.passes) {
    const blocks = new Map<string, number[]>();

    for (let i = 0; i < records.length; i++) {
      const key = buildPassKey(records[i]!, pass);
      if (key === '') continue;
      const block = blocks.get(key) ?? [];
      block.push(i);
      blocks.set(key, block);
    }

    for (const [, indices] of blocks) {
      if (indices.length < 2 || indices.length > 500) continue;
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          const a = indices[i]!;
          const b = indices[j]!;
          pairSet.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
        }
      }
    }
  }

  const pairs = parsePairs(pairSet);
  return {
    pairs,
    totalRecords: records.length,
    reductionRatio: computeReductionRatio(pairs.length, records.length),
    blockCount: pairSet.size,
  };
}

/** Build a blocking key from a record using a pass config. */
function buildPassKey(
  record: Record<string, unknown>,
  pass: { fields: readonly string[]; transforms: readonly string[] },
): string {
  const parts: string[] = [];
  for (const field of pass.fields) {
    const raw = String(record[field] ?? '').trim();
    if (raw === '') return '';
    const transformed = applyBlockingTransforms(raw, pass.transforms as any[]);
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
  maxBlockSize: number = 500,
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
  minNeighborWeight: number = 2,
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
  records: ReadonlyArray<Record<string, unknown>>,
  config: BlockingConfig,
): BlockingResult {
  const field = config.fields?.[0] ?? 'name';
  const transforms = config.transforms ?? ['strip', 'lowercase'];

  // Stage 1: Token Blocking
  const tokenBlocks = new Map<string, number[]>();
  for (let i = 0; i < records.length; i++) {
    const raw = String(records[i]![field] ?? '')
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

// ─── Helpers ────────────────────────────────────────────────────

function parsePairs(pairSet: Set<string>): CandidatePair[] {
  const pairs: CandidatePair[] = [];
  for (const entry of pairSet) {
    const [left, right] = entry.split(':');
    pairs.push({ leftId: Number(left), rightId: Number(right) });
  }
  return pairs;
}
