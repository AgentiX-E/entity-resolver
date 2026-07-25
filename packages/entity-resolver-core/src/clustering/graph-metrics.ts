/**
 * Graph metrics for entity resolution clusters.
 *
 * Splink-compatible graph analytics: bridge detection, cluster density,
 * centrality, degree distribution, and cluster size statistics.
 *
 * All metrics operate on scored pairs — no external graph library required.
 */

import type { ScoredPair } from '../types/core.js';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

/** Per-node metrics for a single record. */
export interface NodeMetrics {
  /** Entity ID. */
  readonly id: number;
  /** Number of edges connected to this node (above threshold). */
  readonly degree: number;
  /** Average similarity score of this node's edges. */
  readonly avgEdgeWeight: number;
  /** Maximum similarity score. */
  readonly maxEdgeWeight: number;
}

/** Metrics for a single cluster. */
export interface ClusterMetrics {
  readonly clusterId: string;
  /** Number of entities in the cluster. */
  readonly size: number;
  /** Cluster density: 2 * |edges| / (|nodes| * (|nodes| - 1)). */
  readonly density: number;
  /**
   * Cluster centrality: proportion of nodes with degree > average degree
   * within the cluster (star-shaped clusters have low centrality).
   */
  readonly centrality: number;
  /** Whether this cluster is connected (all members reachable via edges). */
  readonly isConnected: boolean;
}

/** Aggregate metrics across all clusters. */
export interface ClusterGraphMetrics {
  /** Per-node metrics. */
  readonly nodes: readonly NodeMetrics[];
  /** Per-cluster metrics. */
  readonly clusters: readonly ClusterMetrics[];
  /** Total number of entities. */
  readonly totalEntities: number;
  /** Total number of entities in non-singleton clusters. */
  readonly clusteredEntities: number;
  /** Size of the largest cluster. */
  readonly maxClusterSize: number;
  /** Average cluster size (excluding singletons). */
  readonly averageClusterSize: number;
  /** Number of singletons (entities with no edges). */
  readonly singletonCount: number;
}

// ══════════════════════════════════════════════════════════════
// Core computation
// ══════════════════════════════════════════════════════════════

/**
 * Compute comprehensive graph metrics from scored pairs and clusters.
 *
 * @param pairs All scored pairs (filtered by threshold)
 * @param clusters Entity clusters (from connectedComponents or any other method)
 * @param totalRecords Total number of records in the dataset
 */
export function computeGraphMetrics(
  pairs: readonly ScoredPair[],
  clusters: ReadonlyMap<string, { memberIds: readonly number[] }>,
  totalRecords: number,
): ClusterGraphMetrics {
  // Build adjacency for efficient edge lookup
  const adjacency = new Map<number, { neighbor: number; weight: number }[]>();
  for (const p of pairs) {
    const w = p.probability ?? p.score;
    addEdge(adjacency, p.leftId, p.rightId, w);
  }

  // Per-node metrics
  const nodes: NodeMetrics[] = [];
  for (let i = 0; i < totalRecords; i++) {
    const neighbors = adjacency.get(i) ?? [];
    const degree = neighbors.length;
    let totalWeight = 0;
    let maxWeight = 0;
    for (const edge of neighbors) {
      totalWeight += edge.weight;
      if (edge.weight > maxWeight) maxWeight = edge.weight;
    }
    nodes.push({
      id: i,
      degree,
      avgEdgeWeight: degree > 0 ? totalWeight / degree : 0,
      maxEdgeWeight: maxWeight,
    });
  }

  // Per-cluster metrics
  const clusterMetrics: ClusterMetrics[] = [];
  let clusteredEntities = 0;
  let maxClusterSize = 0;
  let totalClusterSize = 0;

  for (const [clusterId, cluster] of clusters) {
    const members = cluster.memberIds;
    const size = members.length;
    clusteredEntities += size;
    totalClusterSize += size;
    if (size > maxClusterSize) maxClusterSize = size;

    // Compute cluster density
    const maxPossibleEdges = (size * (size - 1)) / 2;
    let actualEdges = 0;
    for (let i = 0; i < members.length; i++) {
      const neighbors = adjacency.get(members[i]!) ?? [];
      for (let j = i + 1; j < members.length; j++) {
        if (neighbors.some((e) => e.neighbor === members[j])) {
          actualEdges++;
        }
      }
    }
    const density = maxPossibleEdges > 0 ? actualEdges / maxPossibleEdges : 0;

    // Compute centrality: proportion of nodes with above-average degree within cluster
    let totalDegree = 0;
    const clusterDegrees: number[] = [];
    for (const memberId of members) {
      const nodeDegree = nodes[memberId]?.degree ?? 0;
      totalDegree += nodeDegree;
      clusterDegrees.push(nodeDegree);
    }
    const avgDeg = size > 0 ? totalDegree / size : 0;
    const aboveAvg = clusterDegrees.filter((d) => d > avgDeg).length;
    const centrality = size > 0 ? aboveAvg / size : 0;

    // Check connectivity via Union-Find of internal edges
    const isConnected = checkConnectivity(members, adjacency);

    clusterMetrics.push({
      clusterId: String(clusterId),
      size,
      density,
      centrality,
      isConnected,
    });
  }

  const nonSingletonClusters = clusterMetrics.filter((c) => c.size > 1);

  return {
    nodes,
    clusters: clusterMetrics,
    totalEntities: totalRecords,
    clusteredEntities,
    maxClusterSize,
    averageClusterSize:
      nonSingletonClusters.length > 0 ? totalClusterSize / nonSingletonClusters.length : 0,
    singletonCount: totalRecords - clusteredEntities,
  };
}

/** Detect bridge edges: edges whose removal disconnects the cluster. */
export function detectBridges(
  pairs: readonly ScoredPair[],
  cluster: { readonly memberIds: readonly number[] },
): { readonly leftId: number; readonly rightId: number }[] {
  const members = new Set(cluster.memberIds);
  const bridges: { leftId: number; rightId: number }[] = [];

  for (const pair of pairs) {
    if (!members.has(pair.leftId) || !members.has(pair.rightId)) continue;

    // Check if removing this edge disconnects: count reachable nodes
    const adjacency = buildClusterAdjacency(pairs, members, pair.leftId, pair.rightId);
    const reachable = bfsReachable(adjacency, pair.leftId);
    if (reachable.size < members.size) {
      bridges.push({ leftId: pair.leftId, rightId: pair.rightId });
    }
  }

  return bridges;
}

// ══════════════════════════════════════════════════════════════
// Internal helpers
// ══════════════════════════════════════════════════════════════

function addEdge(
  adj: Map<number, { neighbor: number; weight: number }[]>,
  a: number,
  b: number,
  weight: number,
): void {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a)!.push({ neighbor: b, weight });
  adj.get(b)!.push({ neighbor: a, weight });
}

function checkConnectivity(
  members: readonly number[],
  adjacency: Map<number, { neighbor: number; weight: number }[]>,
): boolean {
  if (members.length <= 1) return true;
  const visited = new Set<number>();
  const stack = [members[0]!];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visited.has(node)) continue;
    visited.add(node);
    const neighbors = adjacency.get(node) ?? [];
    for (const { neighbor } of neighbors) {
      if (members.includes(neighbor) && !visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }
  return visited.size === members.length;
}

function buildClusterAdjacency(
  pairs: readonly ScoredPair[],
  members: Set<number>,
  excludeLeft: number,
  excludeRight: number,
): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const p of pairs) {
    if (!members.has(p.leftId) || !members.has(p.rightId)) continue;
    if (
      (p.leftId === excludeLeft && p.rightId === excludeRight) ||
      (p.leftId === excludeRight && p.rightId === excludeLeft)
    )
      continue;
    if (!adj.has(p.leftId)) adj.set(p.leftId, []);
    if (!adj.has(p.rightId)) adj.set(p.rightId, []);
    adj.get(p.leftId)!.push(p.rightId);
    adj.get(p.rightId)!.push(p.leftId);
  }
  return adj;
}

function bfsReachable(adj: Map<number, number[]>, start: number): Set<number> {
  const visited = new Set<number>();
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return visited;
}
