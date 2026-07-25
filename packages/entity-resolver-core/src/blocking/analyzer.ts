// Blocking Analyzer — pair count estimation, skew detection, rule recommendation.

import type { CandidatePair, BlockingPass } from './types.js';
import { applyBlockingTransforms, computeReductionRatio } from './types.js';

/**
 * Result of blocking rule analysis.
 */
export interface BlockingAnalysisResult {
  /** Estimated number of pairs this rule will generate (sampling-based). */
  readonly estimatedPairCount: number;
  /** Reduction ratio estimate. */
  readonly estimatedReductionRatio: number;
  /** Whether any blocks are skewed (one block dominates). */
  readonly hasSkewedBlocks: boolean;
  /** The size ratio of the largest block vs average. */
  readonly maxBlockRatio: number;
  /** Human-readable warning if skew is detected. */
  readonly warning?: string | undefined;
}

/**
 * Analyze a blocking rule without generating all pairs.
 * Uses sampling to estimate pair count and detect skew.
 */
export function analyzeBlockingRule(
  records: readonly Record<string, unknown>[],
  pass: BlockingPass,
  options?: { sampleSize?: number },
): BlockingAnalysisResult {
  const sampleSize = options?.sampleSize ?? Math.min(records.length, 10000);
  const sampled = records.slice(0, sampleSize);

  // Build blocks from sample
  const blocks = new Map<string, number[]>();
  for (let i = 0; i < sampled.length; i++) {
    const key = buildBlockingKey(sampled[i]!, pass);
    if (key === '') continue;
    const block = blocks.get(key) ?? [];
    block.push(i);
    blocks.set(key, block);
  }

  // Compute block size statistics
  const blockSizes: number[] = [];
  let totalPairs = 0;
  for (const [, indices] of blocks) {
    blockSizes.push(indices.length);
    if (indices.length >= 2) {
      totalPairs += (indices.length * (indices.length - 1)) / 2;
    }
  }

  // Scale estimate to full dataset
  const scale = records.length / sampleSize;
  const estimatedPairCount = Math.ceil(totalPairs * scale * scale);

  // Average block size
  const avgBlockSize = blockSizes.reduce((a, b) => a + b, 0) / Math.max(blockSizes.length, 1);
  const maxBlockSize = Math.max(...blockSizes, 0);
  const maxBlockRatio = avgBlockSize > 0 ? maxBlockSize / avgBlockSize : 0;

  const estimatedReductionRatio = computeReductionRatio(
    Math.min(estimatedPairCount, records.length * records.length),
    records.length,
  );

  const hasSkewedBlocks = maxBlockRatio > 20;

  return {
    estimatedPairCount,
    estimatedReductionRatio,
    hasSkewedBlocks,
    maxBlockRatio,
    warning: hasSkewedBlocks
      ? `Skewed blocks detected: largest block is ${maxBlockRatio.toFixed(1)}x average. Consider tighter blocking rules.`
      : undefined,
  };
}

/**
 * Analyze all blocking rules in a config and return recommendations.
 */
export function recommendBlockingRules(
  records: readonly Record<string, unknown>[],
  candidatePasses: readonly BlockingPass[],
): BlockingPass[] {
  const analyses = candidatePasses.map((pass) => ({
    pass,
    analysis: analyzeBlockingRule(records, pass),
  }));

  // Reject passes with severe skew
  const good = analyses.filter(
    (a) => !a.analysis.hasSkewedBlocks && a.analysis.estimatedReductionRatio > 0.5,
  );

  // If all have skew, return the least-skewed passes
  if (good.length === 0) {
    return analyses
      .sort((a, b) => a.analysis.maxBlockRatio - b.analysis.maxBlockRatio)
      .slice(0, 4)
      .map((a) => a.pass);
  }

  // Return top 4 passes by reduction ratio (most selective)
  return good
    .sort((a, b) => b.analysis.estimatedReductionRatio - a.analysis.estimatedReductionRatio)
    .slice(0, 4)
    .map((a) => a.pass);
}

/**
 * Verify that a set of blocking rules captures a target percentage of true matches.
 * This is a verification function, not optimization.
 */
export function verifyBlockingRecall(
  pairs: readonly CandidatePair[],
  trueMatchPairs: readonly CandidatePair[],
): number {
  if (trueMatchPairs.length === 0) return 1;

  const pairSet = new Set(pairs.map((p) => `${p.leftId}:${p.rightId}`));
  let captured = 0;

  for (const tp of trueMatchPairs) {
    if (pairSet.has(`${tp.leftId}:${tp.rightId}`)) {
      captured++;
    }
  }

  return captured / trueMatchPairs.length;
}

/** Build a blocking key for a record. */
function buildBlockingKey(record: Record<string, unknown>, pass: BlockingPass): string {
  const parts: string[] = [];
  for (const field of pass.fields) {
    const raw = String(record[field] ?? '').trim();
    if (raw === '') return '';
    const transformed = applyBlockingTransforms(raw, pass.transforms);
    if (transformed === '') return '';
    parts.push(transformed);
  }
  return parts.join('::');
}
