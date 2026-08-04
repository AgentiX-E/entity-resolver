/**
 * U-Pipe Stage 4: Verified Merge Clustering
 *
 * Safe transitive closure that prevents single false-positive edges
 * from cascading unrelated clusters into mega-clusters through
 * blind Union-Find propagation.
 *
 * Algorithm (from arXiv 2607.26298):
 *   1. Center Assignment: each record joins its single highest-scoring
 *      neighbor above threshold (no edge propagation)
 *   2. Verified Merge: for each Stage-1 cluster pair with at least one
 *      above-threshold edge, score up to k=3 representatives per cluster.
 *      If ANY cross-cluster pair triggers a veto → block the merge.
 *
 * When baseline precision >0.9, standard connected components is safe.
 * When baseline precision <0.5, verified merge is ESSENTIAL.
 */

import type { ScoredPair } from '../types/core.js';
import type { UnifiedScoredPair, VerifiedCluster } from './unified.js';

// ═══════════════════════════════════════════════════════════════
// Verified Merge Clustering
// ═══════════════════════════════════════════════════════════════

export interface ClusteringOptions {
  /** Match threshold for cluster assignment. */
  readonly threshold?: number;
  /** Number of representatives per cluster for verification (default: 3). */
  readonly k?: number;
  /** Whether to skip verification when baseline precision is high. */
  readonly autoSafety?: boolean;
  /** Estimated precision (0-1). If <0.5, verification is mandatory. */
  readonly precisionEstimate?: number;
}

export interface ClusteringOutput {
  readonly clusters: readonly VerifiedCluster[];
  readonly singletons: readonly number[];
  readonly stats: {
    readonly attemptedMerges: number;
    readonly blockedMerges: number;
    readonly verifiedMerges: number;
  };
}

/**
 * Run verified merge clustering on scored pairs.
 *
 * Two-stage algorithm:
 *   1. Center assignment: greedy single-best-neighbor clustering
 *   2. Verified merge: re-score cross-cluster edges with veto power
 */
export function verifiedMergeClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options: ClusteringOptions = {},
): ClusteringOutput {
  const threshold = options.threshold ?? 0.5;
  const k = options.k ?? 3;
  const precision = options.precisionEstimate ?? 0.8;

  // Safety gate: if baseline precision is high enough, transitivity is safe
  if (options.autoSafety !== false && precision >= 0.9) {
    return fastTransitiveClosure(pairs, totalRecords, threshold);
  }

  // Stage 1: Center assignment — each record joins its strongest neighbor
  const aboveThreshold = pairs.filter((p) => (p.probability ?? p.score) >= threshold)
    .sort((a, b) => (b.probability ?? b.score) - (a.probability ?? a.score));

  const assigned = new Set<number>();
  const clusters: number[][] = [];
  const clusterOf = new Map<number, number>(); // record → cluster index
  const records = new Set<number>();

  for (const p of aboveThreshold) {
    records.add(p.leftId);
    records.add(p.rightId);
  }

  // Greedy center assignment
  for (const p of aboveThreshold) {
    if (assigned.has(p.leftId) && assigned.has(p.rightId)) continue;

    if (!assigned.has(p.leftId) && !assigned.has(p.rightId)) {
      // New cluster
      const cId = clusters.length;
      clusters.push([p.leftId, p.rightId]);
      clusterOf.set(p.leftId, cId);
      clusterOf.set(p.rightId, cId);
      assigned.add(p.leftId);
      assigned.add(p.rightId);
    } else if (!assigned.has(p.leftId)) {
      const cId = clusterOf.get(p.rightId)!;
      clusters[cId]!.push(p.leftId);
      clusterOf.set(p.leftId, cId);
      assigned.add(p.leftId);
    } else if (!assigned.has(p.rightId)) {
      const cId = clusterOf.get(p.leftId)!;
      clusters[cId]!.push(p.rightId);
      clusterOf.set(p.rightId, cId);
      assigned.add(p.leftId); // already assigned
    }
  }

  // Collect singletons
  const singletons: number[] = [];
  for (let i = 0; i < totalRecords; i++) {
    if (!assigned.has(i) && records.has(i)) singletons.push(i);
  }
  // Also include records not in any pair
  for (let i = 0; i < totalRecords; i++) {
    if (!records.has(i)) singletons.push(i);
  }

  // Stage 2: Verified Merge — re-check cross-cluster edges
  const crossClusterEdges = findCrossClusterEdges(pairs, clusterOf);

  // Build edge map for quick lookup
  const edgeMap = new Map<string, ScoredPair>();
  for (const p of pairs) {
    edgeMap.set(`${p.leftId}:${p.rightId}`, p);
    edgeMap.set(`${p.rightId}:${p.leftId}`, p);
  }

  let attemptedMerges = 0;
  let blockedMerges = 0;
  let verifiedMerges = 0;

  // Process cross-cluster edges: merge clusters only if ALL representative
  // pairs pass the threshold (single veto blocks the merge)
  const mergeGraph = new Map<number, Set<number>>(); // cluster → mergeable clusters
  const blockedPairs = new Set<string>(); // "c1:c2" pairs already assessed

  for (const edge of crossClusterEdges) {
    const c1 = edge.c1;
    const c2 = edge.c2;
    const key = Math.min(c1, c2) + ':' + Math.max(c1, c2);
    if (blockedPairs.has(key)) continue;
    blockedPairs.add(key);
    attemptedMerges++;

    // Select up to k representatives from each cluster
    const reps1 = selectRepresentatives(clusters[c1]!, k);
    const reps2 = selectRepresentatives(clusters[c2]!, k);

    let vetoed = false;
    for (const r1 of reps1) {
      for (const r2 of reps2) {
        const repEdge = edgeMap.get(`${r1}:${r2}`) ?? edgeMap.get(`${r2}:${r1}`);
        if (repEdge && (repEdge.probability ?? repEdge.score) < threshold) {
          vetoed = true;
          break;
        }
      }
      if (vetoed) break;
    }

    if (!vetoed) {
      // Merge clusters
      verifiedMerges++;
      const merged = mergeClusters(clusters, c1, c2);
      // Update clusterOf for all members
      for (const m of merged) {
        clusterOf.set(m, c1);
      }
      clusters[c1] = merged;
      clusters[c2] = [];
    } else {
      blockedMerges++;
    }
  }

  // Filter out empty clusters and build result
  const finalClusters: VerifiedCluster[] = [];
  for (const c of clusters) {
    if (c.length > 0) {
      finalClusters.push({
        members: c,
        centroid: {}, // Computed from records in full implementation
        confidence: 1.0,
        verified: true,
      });
    }
  }

  return {
    clusters: finalClusters,
    singletons,
    stats: {
      attemptedMerges,
      blockedMerges,
      verifiedMerges,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Fast standard transitive closure (connected components via Union-Find). */
function fastTransitiveClosure(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  threshold: number,
): ClusteringOutput {
  // Union-Find
  const parent = new Array(totalRecords).fill(-1);
  const find = (x: number): number => {
    if (parent[x] === -1) return x;
    parent[x] = find(parent[x]!);
    return parent[x]!;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (const p of pairs) {
    if ((p.probability ?? p.score) >= threshold) {
      union(p.leftId, p.rightId);
    }
  }

  // Collect clusters
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < totalRecords; i++) {
    const root = find(i);
    const members = clusterMap.get(root) ?? [];
    members.push(i);
    clusterMap.set(root, members);
  }

  const clusters: VerifiedCluster[] = [];
  const singletons: number[] = [];
  for (const [, members] of clusterMap) {
    if (members.length > 1) {
      clusters.push({ members, centroid: {}, confidence: 1.0, verified: false });
    } else {
      singletons.push(members[0]!);
    }
  }

  return {
    clusters,
    singletons,
    stats: { attemptedMerges: 0, blockedMerges: 0, verifiedMerges: 0 },
  };
}

/** Find edges connecting different clusters. */
interface CrossEdge { readonly c1: number; readonly c2: number; readonly score: number; }

function findCrossClusterEdges(
  pairs: readonly ScoredPair[],
  clusterOf: Map<number, number>,
): CrossEdge[] {
  const edges: CrossEdge[] = [];
  for (const p of pairs) {
    const c1 = clusterOf.get(p.leftId);
    const c2 = clusterOf.get(p.rightId);
    if (c1 !== undefined && c2 !== undefined && c1 !== c2) {
      edges.push({ c1, c2, score: p.probability ?? p.score });
    }
  }
  return edges;
}

/** Select up to k representative members from a cluster. */
function selectRepresentatives(members: readonly number[], k: number): number[] {
  if (members.length <= k) return [...members];
  // Simple: take first k (future: pick closest to centroid)
  return members.slice(0, k);
}

/** Merge two clusters, return the combined cluster. */
function mergeClusters(clusters: number[][], c1: number, c2: number): number[] {
  return [...(clusters[c1] ?? []), ...(clusters[c2] ?? [])];
}
