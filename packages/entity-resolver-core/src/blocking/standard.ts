// Standard Blocking — Splink-style multi-rule blocking.
// Supports `block_on("first_name", "surname")` syntax with UNION of multiple rules.

import type { BlockingConfig, BlockingPass, BlockingResult } from './types.js';
import { applyBlockingTransforms, computeReductionRatio, parseCandidatePairs } from './types.js';
import { getFieldString } from '../types/core.js';

/**
 * Standard blocking: groups records by blocking key and produces
 * all pairwise combinations within each group.
 *
 * Multiple passes are combined via UNION (a pair is included if
 * it matches ANY pass).
 */
export function standardBlocking(
  records: readonly Record<string, unknown>[],
  config: BlockingConfig,
): BlockingResult {
  const pairSet = new Set<string>();
  const totalRecords = records.length;

  const passes = config.passes ?? [
    {
      fields: config.fields ?? ['id'],
      transforms: config.transforms ?? ['strip', 'lowercase'],
    },
  ];

  let totalBlockCount = 0;

  for (const pass of passes) {
    // Group records by blocking key
    const blocks = new Map<string, number[]>();

    for (let i = 0; i < records.length; i++) {
      const key = buildBlockingKey(records[i]!, pass);
      if (key === '') continue;
      const block = blocks.get(key) ?? [];
      block.push(i);
      blocks.set(key, block);
    }

    totalBlockCount += blocks.size;

    // Generate pairwise combinations within each block
    for (const [, indices] of blocks) {
      if (indices.length < 2) continue;
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
  const blockCount = totalBlockCount;
  const reductionRatio = computeReductionRatio(pairs.length, totalRecords);

  return { pairs, totalRecords, reductionRatio, blockCount };
}

/**
 * Build a blocking key from a record's field values.
 */
function buildBlockingKey(record: Record<string, unknown>, pass: BlockingPass): string {
  const parts: string[] = [];
  for (const field of pass.fields) {
    const raw = getFieldString(record, field).trim();
    if (raw === '') return ''; // Skip records with empty blocking keys
    const transformed = applyBlockingTransforms(raw, pass.transforms);
    if (transformed === '') return '';
    parts.push(transformed);
  }
  return parts.join('::');
}

/**
 * Convenience function: create a blocking pass config.
 * Usage: blockOn("first_name", "surname") — Splink-style
 */
export function blockOn(...fields: readonly string[]): BlockingPass {
  return {
    fields,
    transforms: ['strip', 'lowercase'],
  };
}

/**
 * Convenience: block with soundex phonetic matching.
 */
export function blockOnSoundex(...fields: readonly string[]): BlockingPass {
  return {
    fields,
    transforms: ['strip', 'lowercase', 'soundex'],
  };
}
