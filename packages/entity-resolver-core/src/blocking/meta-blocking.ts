/**
 * Meta-blocking engine — pyJedAI-compatible weighting schemes and pruning methods.
 *
 * Meta-blocking restructures a redundancy-positive block collection into a
 * new one that contains substantially fewer redundant comparisons while
 * maintaining the original number of matching ones.
 *
 * Ported from pyJedAI (University of Athens) — Python → TypeScript.
 *
 * Architecture:
 * 1. Token Blocking generates initial blocks
 * 2. Block Purging drops oversized blocks
 * 3. Weighting Scheme computes edge weights
 * 4. Pruning Method selects which edges to retain
 */

import type { CandidatePair, BlockingResult } from './types.js';
import { computeReductionRatio } from './types.js';
import { blockPurging } from './strategies.js';

// ══════════════════════════════════════════════════════════════
// Weighting schemes
// ══════════════════════════════════════════════════════════════

/**
 * Available meta-blocking weighting schemes.
 *
 * | Scheme   | Formula |
 * |----------|---------|
 * | CBS      | Co-occurrence count (raw frequency) |
 * | JACCARD  | |A ∩ B| / |A ∪ B| |
 * | COSINE   | |A ∩ B| / √(|A| × |B|) |
 * | DICE     | 2·|A ∩ B| / (|A| + |B|) |
 * | ECBS     | co-occur × log10(N/|A|) × log10(N/|B|) |
 * | EJS      | JS score × log10(distinct/comp[A]) × log10(distinct/comp[B]) |
 * | X2       | Chi-square statistic |
 */
export type WeightingScheme = 'CBS' | 'JACCARD' | 'COSINE' | 'DICE' | 'ECBS' | 'EJS' | 'X2';

// ══════════════════════════════════════════════════════════════
// Internal graph representation
// ══════════════════════════════════════════════════════════════

interface Edge {
  entityId: number;
  neighborId: number;
  weight: number;
}

interface EntityNeighborhood {
  edges: Edge[];
  /** Total number of distinct neighbors for this entity. */
  count: number;
}

/**
 * Build an entity-to-entity graph from blocks.
 *
 * For each block, creates edges between every pair of entities.
 * Co-occurrence counts accumulate across all blocks.
 */
function buildEntityGraph(
  records: readonly Record<string, unknown>[],
  blocks: Map<string, number[]>,
): {
  neighborhoods: Map<number, EntityNeighborhood>;
  totalBlocks: number;
  totalEntities: number;
} {
  const totalEntities = records.length;
  const coOccur = new Map<number, Map<number, number>>();
  const totalBlocks = blocks.size;

  for (const [, entities] of blocks) {
    for (let i = 0; i < entities.length; i++) {
      const a = entities[i]!;
      for (let j = i + 1; j < entities.length; j++) {
        const b = entities[j]!;
        // Increment co-occurrence bidirectionally
        if (!coOccur.has(a)) coOccur.set(a, new Map());
        if (!coOccur.has(b)) coOccur.set(b, new Map());
        coOccur.get(a)!.set(b, (coOccur.get(a)!.get(b) ?? 0) + 1);
        coOccur.get(b)!.set(a, (coOccur.get(b)!.get(a) ?? 0) + 1);
      }
    }
  }

  // Build neighborhoods
  const neighborhoods = new Map<number, EntityNeighborhood>();
  for (const [entityId, neighbors] of coOccur) {
    const edges: Edge[] = [];
    for (const [neighborId, count] of neighbors) {
      edges.push({ entityId, neighborId, weight: count });
    }
    neighborhoods.set(entityId, { edges, count: edges.length });
  }

  return { neighborhoods, totalBlocks, totalEntities };
}

/**
 * Compute the number of blocks each entity participates in.
 */
function computeEntityBlockCounts(
  blocks: Map<string, number[]>,
  _totalEntities: number,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const [, entities] of blocks) {
    for (const id of entities) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Apply a weighting scheme to all edges in the entity graph.
 */
function applyWeightingScheme(
  neighborhoods: Map<number, EntityNeighborhood>,
  scheme: WeightingScheme,
  blockCounts: Map<number, number>,
  totalBlocks: number,
): Map<number, Map<number, number>> {
  const weighted = new Map<number, Map<number, number>>();

  for (const [entityId, hood] of neighborhoods) {
    const entityBlocks = blockCounts.get(entityId) ?? 1;
    const weights = new Map<number, number>();

    for (const edge of hood.edges) {
      const neighborBlocks = blockCounts.get(edge.neighborId) ?? 1;
      const coOccurrence = edge.weight;

      let w: number;
      switch (scheme) {
        case 'CBS':
          w = coOccurrence;
          break;

        case 'JACCARD': {
          const entitySetSize = hood.count;
          const neighborSetSize = neighborhoods.get(edge.neighborId)?.count ?? 1;
          w = coOccurrence / (entitySetSize + neighborSetSize - coOccurrence || 1);
          break;
        }

        case 'COSINE': {
          const es = hood.count;
          const ns = neighborhoods.get(edge.neighborId)?.count ?? 1;
          w = coOccurrence / Math.sqrt(es * ns || 1);
          break;
        }

        case 'DICE': {
          const es = hood.count;
          const ns = neighborhoods.get(edge.neighborId)?.count ?? 1;
          w = (2 * coOccurrence) / (es + ns || 1);
          break;
        }

        case 'ECBS':
          w =
            coOccurrence *
            Math.log10(totalBlocks / (entityBlocks || 1)) *
            Math.log10(totalBlocks / (neighborBlocks || 1));
          break;

        case 'EJS': {
          const es = hood.count;
          const ns = neighborhoods.get(edge.neighborId)?.count ?? 1;
          const js = coOccurrence / (es + ns - coOccurrence || 1);
          const distinctNeighbors = neighborhoods.size || 1;
          w =
            js *
            Math.log10(distinctNeighbors / (entityBlocks || 1)) *
            Math.log10(distinctNeighbors / (neighborBlocks || 1));
          break;
        }

        case 'X2': {
          const observed = coOccurrence;
          const expected = (entityBlocks * neighborBlocks) / totalBlocks || 0;
          const chi =
            (observed - expected) ** 2 / (expected || 1) +
            (entityBlocks - observed - (totalBlocks - entityBlocks - neighborBlocks + observed)) **
              2 /
              (totalBlocks - entityBlocks - neighborBlocks + observed || 1);
          w = chi;
          break;
        }

        default:
          w = coOccurrence;
      }

      weights.set(edge.neighborId, Math.max(0, w));
    }

    weighted.set(entityId, weights);
  }

  return weighted;
}

// ══════════════════════════════════════════════════════════════
// Pruning methods
// ══════════════════════════════════════════════════════════════

/**
 * Available pruning methods.
 */
export type PruningMethod =
  | 'WEP' // Weighted Edge Pruning — retain edges above average weight
  | 'CEP' // Cardinality Edge Pruning — retain top-K edges globally
  | 'CNP' // Cardinality Node Pruning — retain top-K edges per entity
  | 'RCNP' // Reciprocal CNP — edge must be in top-K for both entities
  | 'WNP' // Weighted Node Pruning — retain edges above entity's average
  | 'BLAST' // Edge weight > 1/4 * (maxWeight_A + maxWeight_B)
  | 'RWNP' // Reciprocal WNP — edge above average in BOTH neighborhoods
  | 'CP'; // Comparison Propagation — keep all non-zero edges

// ══════════════════════════════════════════════════════════════
// Main meta-blocking pipeline
// ══════════════════════════════════════════════════════════════

export interface MetaBlockingConfig {
  /** Fields for token blocking. */
  readonly fields?: readonly string[];
  /** Weighting scheme. Default: 'CBS'. */
  readonly weightingScheme?: WeightingScheme;
  /** Pruning method. Default: 'WEP'. */
  readonly pruningMethod?: PruningMethod;
  /** Block purging max size. Default: 500. */
  readonly maxBlockSize?: number;
  /** Top-K for CEP/CNP methods. Default: 10. */
  readonly topK?: number;
}

/**
 * Run the full meta-blocking pipeline:
 * Token Blocking → Block Purging → Weighting → Pruning → Candidate Pairs.
 *
 * This implements the pyJedAI meta-blocking workflow in TypeScript.
 */
export function metaBlockingFull(
  records: readonly Record<string, unknown>[],
  config: MetaBlockingConfig = {},
): BlockingResult {
  const weightingScheme = config.weightingScheme ?? 'CBS';
  const pruningMethod = config.pruningMethod ?? 'WEP';
  const maxBlockSize = config.maxBlockSize ?? 500;
  const topK = config.topK ?? 10;
  const fields = config.fields ?? Object.keys(records[0] ?? {});

  // Step 1: Build token blocks
  const tokenBlocks = new Map<string, number[]>();
  for (let i = 0; i < records.length; i++) {
    const tokens = tokenizeRecordForBlocks(records[i]!, fields);
    for (const token of tokens) {
      const key = token.toLowerCase();
      if (!tokenBlocks.has(key)) tokenBlocks.set(key, []);
      tokenBlocks.get(key)!.push(i);
    }
  }
  const purged = blockPurging(tokenBlocks, maxBlockSize);

  // Step 3: Build entity graph
  const { neighborhoods, totalBlocks, totalEntities } = buildEntityGraph(records, purged);

  // Step 4: Apply weighting scheme
  const blockCounts = computeEntityBlockCounts(purged, totalEntities);
  const weights = applyWeightingScheme(neighborhoods, weightingScheme, blockCounts, totalBlocks);

  // Step 5: Apply pruning
  const retainedEdges = pruneEdges(neighborhoods, weights, pruningMethod, topK);

  // Step 6: Convert to candidate pairs
  const pairSet = new Set<string>();
  const pairs: CandidatePair[] = [];
  for (const [entityId, neighbors] of retainedEdges) {
    for (const neighborId of neighbors) {
      const key = entityId < neighborId ? `${entityId}:${neighborId}` : `${neighborId}:${entityId}`;
      if (!pairSet.has(key)) {
        pairSet.add(key);
        pairs.push({
          leftId: entityId < neighborId ? entityId : neighborId,
          rightId: entityId < neighborId ? neighborId : entityId,
        });
      }
    }
  }

  const total = records.length;
  const totalPossible = (total * (total - 1)) / 2;
  return {
    pairs,
    blockCount: purged.size,
    totalRecords: total,
    reductionRatio: computeReductionRatio(pairs.length, totalPossible),
  };
}

/** Tokenize a single record for blocking. */
function tokenizeRecordForBlocks(
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

/**
 * Apply the selected pruning method to retain a subset of edges.
 */
function pruneEdges(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  method: PruningMethod,
  topK: number,
): Map<number, Set<number>> {
  const retained = new Map<number, Set<number>>();

  switch (method) {
    case 'WEP':
      return wepPrune(neighborhoods, weights, retained);

    case 'CEP':
      return cepPrune(neighborhoods, weights, topK, retained);

    case 'CNP':
      return cnpPrune(neighborhoods, weights, topK, retained);

    case 'RCNP':
      return rcnpPrune(neighborhoods, weights, topK, retained);

    case 'WNP':
      return wnpPrune(neighborhoods, weights, retained);

    case 'BLAST':
      return blastPrune(neighborhoods, weights, retained);

    case 'RWNP':
      return rwnpPrune(neighborhoods, weights, retained);

    case 'CP':
      return cpPrune(neighborhoods, weights, retained);

    default:
      return wepPrune(neighborhoods, weights, retained);
  }
}

/** Weighted Edge Pruning: retain edges with weight >= average. */
function wepPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  void neighborhoods; // unused but kept for interface consistency with other prune methods
  // Compute global average weight
  let totalWeight = 0;
  let totalEdges = 0;
  for (const [, wmap] of weights) {
    for (const [, w] of wmap) {
      totalWeight += w;
      totalEdges++;
    }
  }
  const avg = totalEdges > 0 ? totalWeight / totalEdges : 0;

  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights) continue;

    const kept = new Set<number>();
    for (const edge of hood.edges) {
      const w = entityWeights.get(edge.neighborId) ?? 0;
      if (w >= avg) kept.add(edge.neighborId);
    }
    if (kept.size > 0) retained.set(entityId, kept);
  }

  return retained;
}

/** Cardinality Edge Pruning: retain top-K edges globally. */
function cepPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  topK: number,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  void neighborhoods; // unused — CEP uses global weight ordering, not per-entity structure
  const allEdges: { entityId: number; neighborId: number; weight: number }[] = [];
  for (const [entityId, wmap] of weights) {
    for (const [neighborId, w] of wmap) {
      allEdges.push({ entityId, neighborId, weight: w });
    }
  }
  allEdges.sort((a, b) => b.weight - a.weight);

  const selected = allEdges.slice(0, topK);
  for (const edge of selected) {
    if (!retained.has(edge.entityId)) retained.set(edge.entityId, new Set());
    retained.get(edge.entityId)!.add(edge.neighborId);
    if (!retained.has(edge.neighborId)) retained.set(edge.neighborId, new Set());
    retained.get(edge.neighborId)!.add(edge.entityId);
  }

  return retained;
}

/** Cardinality Node Pruning: retain top-K edges per entity. */
function cnpPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  topK: number,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights) continue;

    // Sort edges by weight descending
    const sorted = hood.edges
      .map((e) => ({ id: e.neighborId, w: entityWeights.get(e.neighborId) ?? 0 }))
      .sort((a, b) => b.w - a.w);

    const kept = new Set<number>();
    for (let i = 0; i < Math.min(topK, sorted.length); i++) {
      kept.add(sorted[i]!.id);
    }
    if (kept.size > 0) retained.set(entityId, kept);
  }

  return retained;
}

/** Reciprocal CNP: edge must be in top-K for BOTH entities. */
function rcnpPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  topK: number,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  // First pass: compute top-K for each entity
  const topSets = new Map<number, Set<number>>();
  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights) continue;
    const sorted = hood.edges
      .map((e) => ({ id: e.neighborId, w: entityWeights.get(e.neighborId) ?? 0 }))
      .sort((a, b) => b.w - a.w);
    const top = new Set<number>();
    for (let i = 0; i < Math.min(topK, sorted.length); i++) {
      top.add(sorted[i]!.id);
    }
    topSets.set(entityId, top);
  }

  // Second pass: reciprocal check
  for (const [entityId, top] of topSets) {
    const kept = new Set<number>();
    for (const neighborId of top) {
      const neighborTop = topSets.get(neighborId);
      if (neighborTop?.has(entityId)) {
        kept.add(neighborId);
      }
    }
    if (kept.size > 0) retained.set(entityId, kept);
  }

  return retained;
}

/** Weighted Node Pruning: retain edges above entity's average weight. */
function wnpPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights || hood.edges.length === 0) continue;

    // Compute per-entity average
    let sum = 0;
    for (const edge of hood.edges) {
      sum += entityWeights.get(edge.neighborId) ?? 0;
    }
    const avg = sum / hood.edges.length;

    const kept = new Set<number>();
    for (const edge of hood.edges) {
      const w = entityWeights.get(edge.neighborId) ?? 0;
      if (w >= avg) kept.add(edge.neighborId);
    }
    if (kept.size > 0) retained.set(entityId, kept);
  }

  return retained;
}

/** BLAST: edge weight >= 1/4 * (maxWeight_A + maxWeight_B). */
function blastPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights) continue;

    // Compute max weight for this entity
    let maxA = 0;
    for (const edge of hood.edges) {
      const w = entityWeights.get(edge.neighborId) ?? 0;
      if (w > maxA) maxA = w;
    }

    const kept = new Set<number>();
    for (const edge of hood.edges) {
      const w = entityWeights.get(edge.neighborId) ?? 0;
      // Get max weight for neighbor
      const neighborWeights = weights.get(edge.neighborId);
      let maxB = 0;
      if (neighborWeights) {
        for (const [, nw] of neighborWeights) {
          if (nw > maxB) maxB = nw;
        }
      }
      const threshold = 0.25 * (maxA + maxB);
      if (w >= threshold) kept.add(edge.neighborId);
    }
    if (kept.size > 0) retained.set(entityId, kept);
  }

  return retained;
}

/** Reciprocal WNP: edge above average in BOTH neighborhoods. */
function rwnpPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  // Compute per-entity averages
  const averages = new Map<number, number>();
  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights || hood.edges.length === 0) continue;
    let sum = 0;
    for (const edge of hood.edges) {
      sum += entityWeights.get(edge.neighborId) ?? 0;
    }
    averages.set(entityId, sum / hood.edges.length);
  }

  // Reciprocal check
  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights) continue;
    const avgA = averages.get(entityId) ?? 0;

    const kept = new Set<number>();
    for (const edge of hood.edges) {
      const w = entityWeights.get(edge.neighborId) ?? 0;
      const avgB = averages.get(edge.neighborId) ?? 0;
      if (w >= avgA && w >= avgB) kept.add(edge.neighborId);
    }
    if (kept.size > 0) retained.set(entityId, kept);
  }

  return retained;
}

/** Comparison Propagation: retain all edges with weight > 0. */
function cpPrune(
  neighborhoods: Map<number, EntityNeighborhood>,
  weights: Map<number, Map<number, number>>,
  retained: Map<number, Set<number>>,
): Map<number, Set<number>> {
  for (const [entityId, hood] of neighborhoods) {
    const entityWeights = weights.get(entityId);
    if (!entityWeights) continue;

    const kept = new Set<number>();
    for (const edge of hood.edges) {
      const w = entityWeights.get(edge.neighborId) ?? 0;
      if (w > 0) kept.add(edge.neighborId);
    }
    if (kept.size > 0) retained.set(entityId, kept);
  }

  return retained;
}
