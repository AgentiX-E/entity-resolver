// Clustering algorithms for entity-resolution.
// Transforms scored pairs into entity clusters.

import type { ScoredPair, EntityId, Cluster } from '../types/core.js';

export interface ClusteringResult {
  readonly clusters: ReadonlyMap<EntityId, Cluster>;
  readonly singletons: readonly number[];
  readonly metadata: ClusteringMetadata;
}

export interface ClusteringMetadata {
  readonly numClusters: number;
  readonly numSingletons: number;
  readonly averageClusterSize: number;
  readonly maxClusterSize: number;
  readonly totalRecords: number;
}

// Union-Find helper
function ufFind(parent: number[], x: number): number {
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]!]!;
    x = parent[x]!;
  }
  return x;
}

function ufUnion(parent: number[], a: number, b: number): void {
  const ra = ufFind(parent, a);
  const rb = ufFind(parent, b);
  if (ra !== rb) parent[ra] = rb;
}

// ═══════════════════════════════════════════════════════
// Strategy 1: Connected Components
// ═══════════════════════════════════════════════════════

export function connectedComponents(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  threshold: number,
): ClusteringResult {
  const parent = Array.from({ length: totalRecords }, (_, i) => i);
  for (const pair of pairs) {
    if (pair.score >= threshold || (pair.probability ?? 0) >= threshold) {
      ufUnion(parent, pair.leftId, pair.rightId);
    }
  }
  return buildResult(parent, totalRecords, 'cc');
}

// ═══════════════════════════════════════════════════════
// Strategy 2: DBSCAN
// ═══════════════════════════════════════════════════════

export function dbscanClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  eps: number,
  minPts: number,
): ClusteringResult {
  const neighbors = Array.from({ length: totalRecords }, () => [] as number[]);
  for (const pair of pairs) {
    if (pair.score >= eps) {
      neighbors[pair.leftId]!.push(pair.rightId);
      neighbors[pair.rightId]!.push(pair.leftId);
    }
  }

  const labels = new Array<number>(totalRecords).fill(-1);
  let clusterId = 0;

  for (let i = 0; i < totalRecords; i++) {
    if (labels[i] !== -1) continue;
    const nbrs = neighbors[i]!;
    if (nbrs.length < minPts) {
      labels[i] = -2;
      continue;
    }
    labels[i] = clusterId;
    const seeds = [...nbrs];
    for (let s = 0; s < seeds.length; s++) {
      const point = seeds[s]!;
      if (labels[point] === -2) labels[point] = clusterId;
      if (labels[point] !== -1) continue;
      labels[point] = clusterId;
      const pointNbrs = neighbors[point]!;
      if (pointNbrs.length >= minPts) {
        for (const n of pointNbrs) {
          if (!seeds.includes(n)) seeds.push(n);
        }
      }
    }
    clusterId++;
  }

  return buildFromLabels(labels, totalRecords, 'dbscan');
}

// ═══════════════════════════════════════════════════════
// Strategy 3: Unique Mapping
// ═══════════════════════════════════════════════════════

export function uniqueMapping(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  threshold: number,
): ClusteringResult {
  const sorted = [...pairs].sort((a, b) => b.score - a.score);
  const used = new Set<number>();
  const parent = Array.from({ length: totalRecords }, (_, i) => i);

  for (const pair of sorted) {
    if (pair.score < threshold) break;
    if (used.has(pair.leftId) || used.has(pair.rightId)) continue;
    used.add(pair.leftId);
    used.add(pair.rightId);
    ufUnion(parent, pair.leftId, pair.rightId);
  }

  return buildResult(parent, totalRecords, 'unique');
}

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function buildResult(parent: number[], n: number, method: string): ClusteringResult {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = ufFind(parent, i);
    const g = groups.get(root) ?? [];
    g.push(i);
    groups.set(root, g);
  }
  return finalize(groups, n, method);
}

function buildFromLabels(labels: number[], n: number, method: string): ClusteringResult {
  const groups = new Map<number, number[]>();
  const singletons: number[] = [];
  for (let i = 0; i < n; i++) {
    const label = labels[i]!;
    if (label < 0) {
      singletons.push(i);
      continue;
    }
    const g = groups.get(label) ?? [];
    g.push(i);
    groups.set(label, g);
  }
  return finalize(groups, n, method);
}

function finalize(groups: Map<number, number[]>, n: number, method: string): ClusteringResult {
  const clusters = new Map<EntityId, Cluster>();
  const singletons: number[] = [];
  for (const [root, members] of groups) {
    if (members.length === 1) {
      singletons.push(members[0]!);
      continue;
    }
    const cid: EntityId = `${method}_${root}`;
    clusters.set(cid, { clusterId: cid, memberIds: members, cohesion: 0 });
  }
  const sum = [...clusters.values()].reduce((s, c) => s + c.memberIds.length, 0);
  return {
    clusters,
    singletons,
    metadata: {
      numClusters: clusters.size,
      numSingletons: singletons.length,
      averageClusterSize: clusters.size > 0 ? sum / clusters.size : 0,
      maxClusterSize: Math.max(0, ...[...clusters.values()].map((c) => c.memberIds.length)),
      totalRecords: n,
    },
  };
}
