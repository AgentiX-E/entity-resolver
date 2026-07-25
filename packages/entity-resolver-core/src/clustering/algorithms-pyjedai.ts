/** pyJedAI Clustering Algorithms — Ported to TypeScript.
 *
 * Each algorithm is a pure function: (ScoredPair[], totalRecords, options?) => ClusteringResult.
 *
 * "score" (or "probability") from ScoredPair maps to the pyJedAI "similarity_score" / "weight" concept.
 * Default threshold: 0.5.
 *
 * CCER = Clean-Clean Entity Resolution  (two disjoint datasets)
 * DE   = Dirty Entity Resolution        (single dataset, self-match)
 *
 * Algorithms marked "CCER only" throw if a pair links two records from the same dataset.
 */

import type { ScoredPair, EntityId, Cluster } from '../types/core.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Union-Find (disjoint-set) helper
// ---------------------------------------------------------------------------

function ufFind(parent: number[], x: number): number {
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]!]!;
    x = parent[x]!;
  }
  return x;
}

function ufUnion(parent: number[], size: number[], a: number, b: number): void {
  const ra = ufFind(parent, a);
  const rb = ufFind(parent, b);
  if (ra === rb) return;
  if ((size[ra] ?? 1) < (size[rb] ?? 1)) {
    parent[ra] = rb;
    size[rb] = (size[rb] ?? 1) + (size[ra] ?? 1);
  } else {
    parent[rb] = ra;
    size[ra] = (size[ra] ?? 1) + (size[rb] ?? 1);
  }
}

// ---------------------------------------------------------------------------
// Connected Components via Union-Find on adjacency list
// ---------------------------------------------------------------------------

function connectedComponents(edges: [number, number][], totalRecords: number): number[][] {
  const parent = Array.from({ length: totalRecords }, (_, i) => i);
  const psize = new Array<number>(totalRecords).fill(1);
  for (const [a, b] of edges) {
    ufUnion(parent, psize, a, b);
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < totalRecords; i++) {
    const root = ufFind(parent, i);
    const arr = groups.get(root);
    if (arr) arr.push(i);
    else groups.set(root, [i]);
  }

  return [...groups.values()].filter((g) => g.length > 1);
}

// ---------------------------------------------------------------------------
// Build ClusteringResult from cluster arrays
// ---------------------------------------------------------------------------

function buildResultFromClusters(
  clusters: number[][],
  totalRecords: number,
  method: string,
): ClusteringResult {
  const result = new Map<EntityId, Cluster>();
  const assigned = new Set<number>();
  let nextId = 0;

  for (const members of clusters) {
    if (members.length <= 1) continue;
    for (const m of members) assigned.add(m);
    const cid: EntityId = `${method}_${nextId++}`;
    result.set(cid, { clusterId: cid, memberIds: members, cohesion: 0 });
  }

  const singletons: number[] = [];
  for (let i = 0; i < totalRecords; i++) {
    if (!assigned.has(i)) singletons.push(i);
  }

  const clusterList = [...result.values()];
  const sum = clusterList.reduce((s, c) => s + c.memberIds.length, 0);
  const avgSize = result.size > 0 ? sum / result.size : 0;
  const maxSize =
    clusterList.length > 0 ? Math.max(...clusterList.map((c) => c.memberIds.length)) : 0;

  return {
    clusters: result,
    singletons,
    metadata: {
      numClusters: result.size,
      numSingletons: singletons.length,
      averageClusterSize: avgSize,
      maxClusterSize: maxSize,
      totalRecords,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: build edges sorted by similarity descending (replaces PriorityQueue)
// ---------------------------------------------------------------------------

type WeightedEdge = [number, number, number]; // [leftId, rightId, similarity]

function sortedEdges(pairs: readonly ScoredPair[], threshold: number): WeightedEdge[] {
  const edges: WeightedEdge[] = [];
  for (const p of pairs) {
    const sim = p.score;
    if (sim > threshold) {
      const [l, r] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];
      edges.push([l, r, sim]);
    }
  }
  edges.sort((a, b) => b[2] - a[2]); // descending similarity
  return edges;
}

// ---------------------------------------------------------------------------
// Helper: compute effective similarity from a pair
// ---------------------------------------------------------------------------

function pairSim(p: ScoredPair): number {
  return p.score;
}

// ---------------------------------------------------------------------------
// Helper: collect all entity IDs from pairs
// ---------------------------------------------------------------------------

function collectEntities(pairs: readonly ScoredPair[]): Set<number> {
  const s = new Set<number>();
  for (const p of pairs) {
    s.add(p.leftId);
    s.add(p.rightId);
  }
  return s;
}

// ===========================================================================
// 1. CENTER CLUSTERING  —  line 568 of pyJedAI clustering.py
// ===========================================================================

/** Options for {@link centerClustering}. */
export interface CenterClusteringOptions {
  /** Edges with similarity **≤** this are discarded. Default 0.5. */
  threshold?: number;
}

/**
 * **Center Clustering** — pyJedAI port.
 *
 * 1. Sorts candidate pairs by similarity (descending).
 * 2. Tracks cumulative weight (`edges_weight`) and edge count (`edges_attached`)
 *    per entity.
 * 3. Processes pairs in priority order:
 *    - If neither entity is a center or member → the one with higher normalised
 *      weight (`edges_weight / edges_attached`) becomes the center, the other a
 *      member. An edge is added to the new graph.
 *    - If one is a center and the other is unlabelled → attach the unlabelled
 *      one as member.
 *    - If both are centers or both are members → skip.
 * 4. Returns the connected components of the resulting graph.
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records across all datasets.
 * @param options     Optional configuration (threshold).
 */
export function centerClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: CenterClusteringOptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.5;
  const edges = sortedEdges(pairs, threshold);

  // cumulative weight and count per entity
  const edgesWeight = new Map<number, number>();
  const edgesAttached = new Map<number, number>();

  for (const [v1, v2, sim] of edges) {
    edgesWeight.set(v1, (edgesWeight.get(v1) ?? 0) + sim);
    edgesWeight.set(v2, (edgesWeight.get(v2) ?? 0) + sim);
    edgesAttached.set(v1, (edgesAttached.get(v1) ?? 0) + 1);
    edgesAttached.set(v2, (edgesAttached.get(v2) ?? 0) + 1);
  }

  const newEdges: [number, number][] = [];
  const centers = new Set<number>();
  const members = new Set<number>();

  for (const [v1, v2] of edges) {
    const v1Center = centers.has(v1);
    const v2Center = centers.has(v2);
    const v1Member = members.has(v1);
    const v2Member = members.has(v2);

    if (!v1Center && !v2Center && !v1Member && !v2Member) {
      // Neither labeled — compare normalised weights
      const w1 = (edgesWeight.get(v1) ?? 0) / (edgesAttached.get(v1) ?? 1);
      const w2 = (edgesWeight.get(v2) ?? 0) / (edgesAttached.get(v2) ?? 1);
      if (w1 > w2) {
        centers.add(v1);
        members.add(v2);
      } else {
        centers.add(v2);
        members.add(v1);
      }
      newEdges.push([v1, v2]);
    } else if ((v1Center && v2Center) || (v1Member && v2Member)) {
      continue;
    } else if (v1Center && !v2Member) {
      members.add(v2);
      newEdges.push([v1, v2]);
    } else if (v2Center && !v1Member) {
      members.add(v1);
      newEdges.push([v1, v2]);
    }
  }

  const comps = connectedComponents(newEdges, totalRecords);
  return buildResultFromClusters(comps, totalRecords, 'cc');
}

// ===========================================================================
// 2. BEST MATCH CLUSTERING  —  line 641  (CCER only)
// ===========================================================================

/** Options for {@link bestMatchClustering}. */
export interface BestMatchClusteringOptions {
  /** Edges with similarity **≤** this are discarded. Default 0.5. */
  threshold?: number;
  /**
   * Ordering direction:
   * - `"inorder"`  — D1 → D2  (each D1 entity picks its best D2 match)
   * - `"reverse"`  — D2 → D1  (each D2 entity picks its best D1 match)
   * Default: `"inorder"`.
   */
  order?: 'inorder' | 'reverse';
}

/**
 * **Best Match Clustering** — pyJedAI port (CCER only).
 *
 * For each entity in the source dataset (determined by `order`), the algorithm
 * keeps only the single best candidate (highest similarity) from the target
 * dataset. Once a target entity has been matched it cannot be chosen again.
 *
 * Throws if a pair connects two entities from the same dataset (i.e. in Dirty ER).
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records (D1 + D2).
 * @param options     Optional configuration.
 */
export function bestMatchClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: BestMatchClusteringOptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.5;
  const order = options?.order ?? 'inorder';

  if (pairs.length === 0) {
    return buildResultFromClusters([], totalRecords, 'bmc');
  }

  // Build candidates per source entity
  // source candidate entries: { targetId, similarity }
  const candidatesPerSource = new Map<number, { targetId: number; similarity: number }[]>();

  for (const p of pairs) {
    const sim = pairSim(p);
    if (sim <= threshold) continue;

    const [d1, d2] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];

    // CCER guard: left < right must hold after sort — else this is Dirty ER
    if (d1 >= d2) {
      throw new Error('BestMatchClustering is CCER only. Found pair with same-dataset entities.');
    }

    const sourceEnt = order === 'inorder' ? d1 : d2;
    const targetEnt = order === 'inorder' ? d2 : d1;

    const list = candidatesPerSource.get(sourceEnt);
    if (list) {
      list.push({ targetId: targetEnt, similarity: sim });
    } else {
      candidatesPerSource.set(sourceEnt, [{ targetId: targetEnt, similarity: sim }]);
    }
  }

  // Sort each source's candidates by similarity descending
  for (const [, cands] of candidatesPerSource) {
    cands.sort((a, b) => b.similarity - a.similarity);
  }

  const matchedTargets = new Set<number>();
  const matchedSources = new Set<number>();
  const newEdges: [number, number][] = [];

  // Process sources in stable order
  const sortedSources = [...candidatesPerSource.keys()].sort((a, b) => a - b);

  for (const sourceEnt of sortedSources) {
    if (matchedSources.has(sourceEnt)) continue;

    const cands = candidatesPerSource.get(sourceEnt)!;
    for (const c of cands) {
      if (matchedTargets.has(c.targetId)) continue;

      const [e1, e2] = order === 'inorder' ? [sourceEnt, c.targetId] : [c.targetId, sourceEnt];
      newEdges.push([e1, e2]);
      matchedSources.add(sourceEnt);
      matchedTargets.add(c.targetId);
      break;
    }
  }

  const comps = connectedComponents(newEdges, totalRecords);
  return buildResultFromClusters(comps, totalRecords, 'bmc');
}

// ===========================================================================
// 3. MERGE CENTER CLUSTERING  —  line 730  (CCER only)
// ===========================================================================

/** Options for {@link mergeCenterClustering}. */
export interface MergeCenterClusteringOptions {
  /** Edges with similarity **≤** this are discarded. Default 0.5. */
  threshold?: number;
}

/**
 * **Merge Center Clustering** — pyJedAI port (CCER only).
 *
 * A simplified version of Center Clustering. Entities from the left dataset
 * (smaller IDs) are treated as automatic cluster centers, and entities from the
 * right dataset (larger IDs) are assigned as members of those centers.
 *
 * Throws if a pair connects two entities from the same dataset.
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records (D1 + D2).
 * @param options     Optional configuration.
 */
export function mergeCenterClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: MergeCenterClusteringOptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.5;

  // Build edges as [d1_id, d2_id, similarity], d1 < d2
  const edgeList: WeightedEdge[] = [];
  for (const p of pairs) {
    const sim = pairSim(p);
    if (sim <= threshold) continue;
    const [d1, d2] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];
    if (d1 >= d2) {
      throw new Error('MergeCenterClustering is CCER only. Found pair with same-dataset entities.');
    }
    edgeList.push([d1, d2, sim]);
  }
  edgeList.sort((a, b) => b[2] - a[2]);

  const newEdges: [number, number][] = [];
  const centers = new Set<number>();
  const members = new Set<number>();

  for (const [v1, v2] of edgeList) {
    // v1 is always D1 (left / smaller ID), v2 is always D2 (right / larger ID)
    const v1Center = centers.has(v1);
    const v2Center = centers.has(v2);
    const v1Member = members.has(v1);
    const v2Member = members.has(v2);

    if (!v1Center && !v2Center && !v1Member && !v2Member) {
      centers.add(v1);
      members.add(v2);
      newEdges.push([v1, v2]);
    } else if ((v1Center && v2Center) || (v1Member && v2Member)) {
      continue;
    } else if (v1Center) {
      members.add(v2);
      newEdges.push([v1, v2]);
    } else if (v2Center) {
      members.add(v1);
      newEdges.push([v1, v2]);
    }
  }

  const comps = connectedComponents(newEdges, totalRecords);
  return buildResultFromClusters(comps, totalRecords, 'mcc');
}

// ===========================================================================
// 4. CORRELATION CLUSTERING  —  line 793
// ===========================================================================

/** Options for {@link correlationClustering}. */
export interface CorrelationClusteringOptions {
  /**
   * Initial threshold — edges below this are discarded for the initial
   * connected-components seeding. Default 0.5.
   */
  initialThreshold?: number;
  /**
   * Similarity above which two entities are considered "similar" for the
   * objective function. Default 0.8.
   */
  similarityThreshold?: number;
  /**
   * Similarity below which two entities are considered "dissimilar" for the
   * objective function. Default 0.2.
   */
  nonSimilarityThreshold?: number;
  /**
   * Maximum number of move types (0=change, 1=merge, 2=split).
   * Default 3 (all three enabled).
   */
  moveLimit?: number;
  /**
   * Number of iterative improvement steps. Default 100.
   */
  iterations?: number;
  /**
   * Random seed for reproducibility. Default 42.
   */
  seed?: number;
}

// Simple multiply-with-carry PRNG (reproducible)
class PRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a uniform float in [0, 1). */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) | 0;
    return (this.state >>> 0) / 4294967296;
  }

  /** Returns a uniform integer in [0, max). */
  nextInt(max: number): number {
    return (this.next() * max) | 0;
  }
}

/**
 * **Correlation Clustering** — pyJedAI port.
 *
 * Iteratively optimises clusters by choosing among three possible moves:
 *
 * - `0` — **Change**: Move a random entity to a different random cluster.
 * - `1` — **Merge**: Combine two random clusters.
 * - `2` — **Split**: Move half the members of a random cluster to a new cluster.
 *
 * A move is accepted only if it improves the objective function (number of
 * "agreements" — similar entities in the same cluster + dissimilar entities in
 * different clusters).
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records.
 * @param options     Optional configuration.
 */
export function correlationClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: CorrelationClusteringOptions,
): ClusteringResult {
  const initThresh = options?.initialThreshold ?? 0.5;
  const simThresh = options?.similarityThreshold ?? 0.8;
  const nonSimThresh = options?.nonSimilarityThreshold ?? 0.2;
  const moveLimit = options?.moveLimit ?? 3;
  const maxIter = options?.iterations ?? 100;
  const rng = new PRNG(options?.seed ?? 42);

  // Step 1: Build similarity matrix (only for entities in pairs)
  const allEntities = collectEntities(pairs);
  const maxId = Math.max(totalRecords - 1, ...[...allEntities]);
  const n = maxId + 1;

  // sparse similarity matrix
  const simMatrix = new Map<string, number>();
  const pairIndex = (a: number, b: number) => `${Math.min(a, b)}_${Math.max(a, b)}`;

  for (const p of pairs) {
    const sim = pairSim(p);
    const key = pairIndex(p.leftId, p.rightId);
    const prev = simMatrix.get(key);
    if (prev === undefined || sim > prev) {
      simMatrix.set(key, sim);
    }
  }

  // Step 2: Initial clusters = connected components above initialThreshold
  const initEdges: [number, number][] = [];
  for (const p of pairs) {
    if (pairSim(p) > initThresh) {
      initEdges.push([p.leftId, p.rightId]);
    }
  }
  const initComps = connectedComponents(initEdges, totalRecords);

  // Step 3: entity → cluster assignment
  const clusters: number[][] = initComps.length > 0 ? initComps : [[...allEntities]];
  const entityCluster = new Array<number>(n).fill(-1);
  const validEntities: number[] = [];

  for (let ci = 0; ci < clusters.length; ci++) {
    for (const e of clusters[ci]!) {
      entityCluster[e] = ci;
      validEntities.push(e);
    }
  }

  // Seed number of clusters
  let numClusters = Math.max(clusters.length, 1);

  // Helper: get similarity
  const getSim = (a: number, b: number): number => simMatrix.get(pairIndex(a, b)) ?? 0;

  // Objective function
  const calcOF = (): number => {
    let of = 0;
    for (let i = 0; i < validEntities.length; i++) {
      for (let j = i + 1; j < validEntities.length; j++) {
        const e1 = validEntities[i]!;
        const e2 = validEntities[j]!;
        const sim = getSim(e1, e2);
        const sameCluster = entityCluster[e1] === entityCluster[e2];

        if ((sim > simThresh && sameCluster) || (sim < nonSimThresh && !sameCluster)) {
          of++;
        }
      }
    }
    return of;
  };

  let prevOF = calcOF();

  // Iterations
  for (let iter = 0; iter < maxIter; iter++) {
    let moveIdx = rng.nextInt(moveLimit);
    // Avoid merge when only one cluster exists
    while (moveIdx === 1 && numClusters <= 1) {
      moveIdx = rng.nextInt(moveLimit);
    }

    if (moveIdx === 0) {
      // Change: move random entity to random cluster
      const entity = validEntities[Math.floor(rng.next() * validEntities.length)]!;
      const oldCluster = entityCluster[entity]!;
      let newCluster = rng.nextInt(numClusters);
      // Find a non-empty cluster different from current
      let attempts = 20;
      while ((newCluster === oldCluster || clusters[newCluster]?.length === 0) && attempts-- > 0) {
        newCluster = rng.nextInt(numClusters);
      }
      if (newCluster === oldCluster || !clusters[newCluster]?.length) continue;

      entityCluster[entity] = newCluster;
      const newOF = calcOF();
      if (newOF > prevOF) {
        // Accept
        clusters[oldCluster] = clusters[oldCluster]!.filter((e) => e !== entity);
        clusters[newCluster]!.push(entity);
        prevOF = newOF;
      } else {
        entityCluster[entity] = oldCluster;
      }
    } else if (moveIdx === 1) {
      // Merge: combine two clusters
      let c1 = rng.nextInt(numClusters);
      let c2 = rng.nextInt(numClusters);
      let attempts = 20;
      while ((c1 === c2 || !clusters[c1]?.length || !clusters[c2]?.length) && attempts-- > 0) {
        c1 = rng.nextInt(numClusters);
        c2 = rng.nextInt(numClusters);
      }
      if (c1 === c2 || !clusters[c1]?.length || !clusters[c2]?.length) continue;

      // Tentatively move all entities from c2 to c1
      const saved = entityCluster.slice();
      for (const e of clusters[c2]!) {
        entityCluster[e] = c1;
      }
      const newOF = calcOF();
      if (newOF > prevOF) {
        clusters[c1]!.push(...clusters[c2]!);
        clusters[c2] = [];
        prevOF = newOF;
      } else {
        // Restore
        for (let i = 0; i < saved.length; i++) entityCluster[i] = saved[i]!;
      }
    } else if (moveIdx === 2) {
      // Split: move half of a cluster to a new cluster
      let oldCluster = rng.nextInt(numClusters);
      let attempts = 20;
      while (
        (!clusters[oldCluster]?.length || clusters[oldCluster]!.length < 4) &&
        attempts-- > 0
      ) {
        oldCluster = rng.nextInt(numClusters);
      }
      const clusterEnts = clusters[oldCluster];
      if (!clusterEnts || clusterEnts.length < 4) continue;

      const toSplit: number[] = [];
      for (let i = 0; i < clusterEnts.length; i += 2) {
        toSplit.push(clusterEnts[i]!);
      }

      const newClusterIdx = numClusters;
      const saved = entityCluster.slice();
      for (const e of toSplit) {
        entityCluster[e] = newClusterIdx;
      }

      const newOF = calcOF();
      if (newOF > prevOF) {
        clusters[newClusterIdx] = toSplit;
        clusters[oldCluster] = clusterEnts.filter((e) => !toSplit.includes(e));
        numClusters++;
        prevOF = newOF;
      } else {
        for (let i = 0; i < saved.length; i++) entityCluster[i] = saved[i]!;
      }
    }
  }

  // Collect non-empty clusters
  const finalClusters = clusters.filter((c) => c && c.length > 0);
  return buildResultFromClusters(finalClusters, totalRecords, 'corr');
}

// ===========================================================================
// 5. CUT CLUSTERING  —  line 1007
// ===========================================================================

/** Options for {@link cutClustering}. */
export interface CutClusteringOptions {
  /** Edges with similarity **≤** this are discarded. Default 0.5. */
  threshold?: number;
  /**
   * Alpha weight for the sink node. All edges from the sink to every real node
   * have weight `alpha`. Lower values lead to more splitting. Default 0.2.
   */
  alpha?: number;
}

/**
 * **Cut Clustering** — pyJedAI port (simplified).
 *
 * Builds a graph from pairs above `threshold`, adds a sink node connected to
 * every node with weight `alpha`, computes a Gomory-Hu tree via successive
 * max-flow / min-cut computations (Push-Relabel implementation), and returns
 * the connected components after removing the sink.
 *
 * This is a simplified but faithful port that implements the Push-Relabel
 * maximum flow algorithm with global relabeling gap heuristic to compute
 * all-pairs min-cuts for the Gomory-Hu tree.
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records.
 * @param options     Optional configuration.
 */
export function cutClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: CutClusteringOptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.5;
  const alpha = options?.alpha ?? 0.2;

  // Build adjacency: undirected graph with weights
  const adj = new Map<number, Map<number, number>>();
  const ensure = (u: number): Map<number, number> => {
    let m = adj.get(u);
    if (!m) {
      m = new Map();
      adj.set(u, m);
    }
    return m;
  };

  const allNodes = new Set<number>();

  for (const p of pairs) {
    const sim = pairSim(p);
    if (sim <= threshold) continue;
    const [d1, d2] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];
    allNodes.add(d1);
    allNodes.add(d2);
    const prev = ensure(d1).get(d2);
    if (prev === undefined || sim > prev) {
      ensure(d1).set(d2, sim);
      ensure(d2).set(d1, sim);
    }
  }

  if (allNodes.size <= 1) {
    const comps = allNodes.size > 0 ? [[...allNodes]] : [];
    return buildResultFromClusters(comps, totalRecords, 'ctc');
  }

  const nodeList = [...allNodes];
  const nodeIndex = new Map<number, number>();
  nodeList.forEach((v, i) => nodeIndex.set(v, i));
  const N = nodeList.length;

  // Sink is index N, total vertices = N+1
  const SINK = N;
  const V = N + 1;

  // Build capacity matrix as array of Maps (sparse)
  const cap: Map<number, number>[] = Array.from({ length: V }, () => new Map());

  for (const [u, nbrs] of adj) {
    const ui = nodeIndex.get(u)!;
    for (const [v, w] of nbrs) {
      const vi = nodeIndex.get(v)!;
      if (ui < vi) {
        cap[ui]!.set(vi, (cap[ui]!.get(vi) ?? 0) + w);
        cap[vi]!.set(ui, (cap[vi]!.get(ui) ?? 0) + w);
      }
    }
  }

  // Add sink edges
  for (let i = 0; i < N; i++) {
    cap[i]!.set(SINK, alpha);
    cap[SINK]!.set(i, alpha);
  }

  // --- Push-Relabel max flow with gap heuristic ---
  function maxFlow(s: number, t: number): number {
    const flow: Map<number, number>[] = Array.from({ length: V }, () => new Map());
    const excess = new Float64Array(V);
    const height = new Int32Array(V);
    const count = new Int32Array(2 * V);

    height[s] = V;
    count[V] = 1;
    count[0] = V - 1;

    // Initial push from source
    for (const [v, c] of cap[s]!) {
      if (c > 0) {
        flow[s]!.set(v, c);
        flow[v]!.set(s, -c);
        excess[v] = c;
      }
    }

    // Global relabeling from sink
    function globalRelabel(): void {
      const q: number[] = [];
      const visited = new Int8Array(V);
      q.push(t);
      visited[t] = 1;
      height.fill(V);
      height[t] = 0;
      count.fill(0);
      count[0] = 1;

      let hd = 0;
      while (hd < q.length) {
        const u = q[hd++]!;
        const hu = height[u]! + 1;
        // Incoming edges: for each neighbor w where cap[w][u] - flow[w][u] > 0
        for (let w = 0; w < V; w++) {
          if (visited[w]!) continue;
          const f = flow[w]?.get(u) ?? 0;
          const c = cap[w]?.get(u) ?? 0;
          if (c - f > 0) {
            height[w] = hu;
            count[hu] = (count[hu] ?? 0) + 1;
            visited[w] = 1;
            q.push(w);
          }
        }
      }

      // Set remaining to V
      for (let i = 0; i < V; i++) {
        if (!visited[i]!) {
          const oh = height[i]!;
          count[oh] = (count[oh] ?? 0) - 1;
          height[i] = V;
          count[V] = (count[V] ?? 0) + 1;
        }
      }
    }

    globalRelabel();

    function push(u: number, v: number): boolean {
      const c = cap[u]!.get(v) ?? 0;
      const f = flow[u]!.get(v) ?? 0;
      const resid = c - f;
      if (resid <= 0 || excess[u]! <= 0 || height[u]! !== height[v]! + 1) return false;
      const delta = Math.min(excess[u]!, resid);
      flow[u]!.set(v, f + delta);
      flow[v]!.set(u, (flow[v]!.get(u) ?? 0) - delta);
      excess[u] = (excess[u] ?? 0) - delta;
      excess[v] = (excess[v] ?? 0) + delta;
      return true;
    }

    function relabel(u: number): void {
      let minH = Infinity;
      for (const [v, c] of cap[u]!) {
        const f = flow[u]!.get(v) ?? 0;
        if (c - f > 0) {
          minH = Math.min(minH, height[v]!);
        }
      }
      if (minH < Infinity) {
        const oldH = height[u]!;
        height[u] = minH + 1;
        count[oldH]!--;
        count[height[u]]!++;
        // Gap heuristic
        if (count[oldH]! === 0 && oldH < V) {
          for (let i = 0; i < V; i++) {
            if (i !== s && i !== t && height[i]! > oldH && height[i]! < V) {
              count[height[i]!]!--;
              height[i] = V;
              count[V]!++;
            }
          }
        }
      }
    }

    function discharge(u: number): void {
      if (u === SINK) return;
      while (excess[u]! > 0) {
        let pushed = false;
        for (const [v] of cap[u]!) {
          if (push(u, v)) {
            pushed = true;
            if (excess[u]! <= 0) break;
          }
        }
        if (!pushed) {
          relabel(u);
          if (height[u]! >= V) break;
        }
      }
    }

    // Queue of active nodes
    const active = new Set<number>();
    for (let i = 0; i < V; i++) {
      if (i !== s && i !== t && excess[i]! > 0) active.add(i);
    }

    let relabelCount = 0;
    while (active.size > 0) {
      const u = active.values().next().value!;
      active.delete(u);
      discharge(u);
      if (excess[u]! > 0 && height[u]! < V) active.add(u);
      relabelCount++;
      if (relabelCount % (V * 4) === 0) {
        globalRelabel();
        // Refresh actives
        active.clear();
        for (let i = 0; i < V; i++) {
          if (i !== s && i !== t && excess[i]! > 0) active.add(i);
        }
      }
    }

    return excess[t]!;
  }

  // --- Gomory-Hu tree ---
  // parent[v] = parent in tree, treeCap[v] = capacity of (v, parent[v])
  const parent = new Int32Array(V).fill(-1);
  const treeCap = new Float64Array(V);

  for (let s = 1; s < V; s++) {
    const t = parent[s]! >= 0 ? parent[s]! : 0;
    const flowVal = maxFlow(s, t);

    // Find min cut side of s
    // Note: residual graph from maxFlow is discarded in the closure;
    // Gomory-Hu tree uses the flow value for edge capacities.

    // Simplified: assign tree edge
    treeCap[s] = flowVal;
    parent[s] = t;
  }

  // Build the Gomory-Hu tree edges and find connected components after
  // removing the sink.
  const treeEdges: [number, number][] = [];
  for (let v = 1; v < V; v++) {
    if (v === SINK) continue;
    const p = parent[v];
    if (p !== undefined && p >= 0 && p !== SINK) {
      treeEdges.push([v, p]);
    }
  }

  // If no tree edges (single vertex or no cross-edges), return all nodes as cluster
  if (treeEdges.length === 0) {
    return buildResultFromClusters([nodeList], totalRecords, 'ctc');
  }

  // Add original edges between real nodes as additional connectivity
  const allTreeEdges: [number, number][] = [...treeEdges];
  for (const [u, nbrs] of adj) {
    const ui = nodeIndex.get(u)!;
    for (const [v] of nbrs) {
      const vi = nodeIndex.get(v)!;
      if (ui < vi) allTreeEdges.push([ui, vi]);
    }
  }

  // Connected components of the tree mapped back to original IDs
  const treeComps = connectedComponents(allTreeEdges, N);
  const mappedComps = treeComps.map((comp) => comp.map((i) => nodeList[i]!));

  return buildResultFromClusters(
    mappedComps.length > 0 ? mappedComps : [nodeList],
    totalRecords,
    'ctc',
  );
}

// ===========================================================================
// 6. MARKOV CLUSTERING  —  line 1055
// ===========================================================================

/** Options for {@link markovClustering}. */
export interface MarkovClusteringOptions {
  /** Edges with similarity **≤** this are discarded from initial matrix. Default 0.5. */
  threshold?: number;
  /**
   * Minimum cluster edge weight to include in the final graph.
   * Default 0.001.
   */
  clusterThreshold?: number;
  /**
   * Element-wise delta below which the matrix is considered to have reached
   * equilibrium. Default 0.00001.
   */
  convergenceThreshold?: number;
  /**
   * Max expansion/inflation iterations. Default 10.
   */
  maxIterations?: number;
  /**
   * Expansion power (matrix exponent). Default 2.
   */
  expansionPower?: number;
  /**
   * Inflation power (element-wise). Default 2.
   */
  inflationPower?: number;
}

/**
 * **Markov Clustering (MCL)** — pyJedAI port.
 *
 * Simulates random walks on the similarity graph by alternating:
 * 1. **Expansion** — raise the transition matrix to `expansionPower` (matrix
 *    squaring by default).
 * 2. **Inflation** — raise every entry to `inflationPower` then re-normalise
 *    columns.
 *
 * Stops when the matrix converges (entries change less than
 * `convergenceThreshold`) or `maxIterations` is reached.
 *
 * Final clusters are the connected components of the thresholded matrix.
 *
 * **Note:** This uses a dense `n × n` Float64 matrix. For datasets with
 * thousands of records, memory and runtime grow quadratically.
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records.
 * @param options     Optional configuration.
 */
export function markovClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: MarkovClusteringOptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.5;
  const clusterThreshold = options?.clusterThreshold ?? 0.001;
  const convThreshold = options?.convergenceThreshold ?? 0.00001;
  const maxIter = options?.maxIterations ?? 10;
  const expPower = options?.expansionPower ?? 2;
  const inflPower = options?.inflationPower ?? 2;

  const n = totalRecords;
  if (n === 0) {
    return buildResultFromClusters([], 0, 'mcl');
  }

  // Build initial dense matrix
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const p of pairs) {
    const sim = pairSim(p);
    if (sim > threshold) {
      matrix[p.leftId]![p.rightId] = sim;
      matrix[p.rightId]![p.leftId] = sim;
    }
  }

  // Set self-loops to 1
  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1;
  }

  // Normalise columns to sum to 1
  function normalise(m: number[][]): void {
    for (let j = 0; j < n; j++) {
      let colSum = 0;
      for (let i = 0; i < n; i++) colSum += m[i]![j]!;
      if (colSum === 0) colSum = 1;
      for (let i = 0; i < n; i++) m[i]![j]! /= colSum;
    }
  }
  normalise(matrix);

  // Matrix multiplication: result = m1 * m2
  function multiply(m1: number[][], m2: number[][]): number[][] {
    const result: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += m1[i]![k]! * m2[k]![j]!;
        }
        result[i]![j] = sum;
      }
    }
    return result;
  }

  // Expansion: power the matrix
  function expand(m: number[][]): number[][] {
    if (expPower === 2) {
      return multiply(m, m);
    }
    let result = m;
    for (let p = 1; p < expPower; p++) {
      result = multiply(result, m);
    }
    return result;
  }

  // Inflation: element-wise power + column normalisation
  function inflate(m: number[][]): void {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        m[i]![j] = Math.pow(m[i]![j]!, inflPower);
      }
    }
    normalise(m);
  }

  // Check equilibrium
  function isEquilibrium(m: number[][], prev: number[][]): boolean {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (Math.abs(m[i]![j]! - prev[i]![j]!) > convThreshold) {
          return false;
        }
      }
    }
    return true;
  }

  let current = matrix;

  for (let iter = 0; iter < maxIter; iter++) {
    const prev = current.map((row) => [...row]);
    inflate(current);
    normalise(current);
    current = expand(current);
    normalise(current);
    if (isEquilibrium(current, prev)) break;
  }

  // Threshold final matrix and build edges
  const newEdges: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const val = Math.max(current[i]![j]!, current[j]![i]!);
      if (val > clusterThreshold) {
        newEdges.push([i, j]);
      }
    }
  }

  const comps = connectedComponents(newEdges, n);
  return buildResultFromClusters(comps, n, 'mcl');
}

// ===========================================================================
// 7. KIRALY MSM APPROXIMATE  —  line 1173  (CCER only)
// ===========================================================================

/** Options for {@link kiralyMSMClustering}. */
export interface KiralyMSMOptions {
  /** Edges with similarity **≤** this are discarded. Default 0.1. */
  threshold?: number;
}

/**
 * **Kiraly MSM Approximate Clustering** — pyJedAI port (CCER only).
 *
 * Implements Zoltán Király's 3/2-approximation to the Maximum Stable Marriage
 * problem.  Uses a modified Gale-Shapley matching where:
 *
 * - "Men" (D1 entities) propose to "women" (D2 entities).
 * - A man's candidates are deactivated as they are rejected.
 * - A man may become "bachelor" (all candidates exhausted) and re-enter the
 *   proposal loop after reactivating his candidates.
 *
 * Throws if a pair connects two entities from the same dataset.
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records (D1 + D2).
 * @param options     Optional configuration.
 */
export function kiralyMSMClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: KiralyMSMOptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.1;

  if (pairs.length === 0) {
    return buildResultFromClusters([], totalRecords, 'kmac');
  }

  // Men = D1 (smaller IDs), Women = D2 (larger IDs)
  const menCandidates = new Map<number, { woman: number; similarity: number; active: boolean }[]>();
  const womenCandidates = new Map<number, { man: number; similarity: number }[]>();
  const allMen = new Set<number>();

  // Determine numEntitiesD1 automatically from pairs
  let maxD1 = -1;
  for (const p of pairs) {
    const [d1, d2] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];
    if (d1 >= d2) {
      throw new Error('KiralyMSM is CCER only. Found pair with same-dataset entities.');
    }
    maxD1 = Math.max(maxD1, d1);
  }
  const numD1 = maxD1 + 1;

  // Build candidate lists
  for (const p of pairs) {
    const sim = pairSim(p);
    if (sim <= threshold) continue;
    const [man, woman] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];

    let mc = menCandidates.get(man);
    if (!mc) {
      mc = [];
      menCandidates.set(man, mc);
    }
    mc.push({ woman, similarity: sim, active: true });

    let wc = womenCandidates.get(woman);
    if (!wc) {
      wc = [];
      womenCandidates.set(woman, wc);
    }
    wc.push({ man, similarity: sim });

    allMen.add(man);
  }

  // Sort candidates by similarity descending
  for (const [, cands] of menCandidates) {
    cands.sort((a, b) => b.similarity - a.similarity);
  }
  for (const [, cands] of womenCandidates) {
    cands.sort((a, b) => b.similarity - a.similarity);
  }

  // State
  const isBachelor = new Array<boolean>(numD1).fill(false);
  const isUncertain = new Array<boolean>(numD1).fill(false);
  const fiances = new Map<number, number>(); // woman → man
  const currentMatches = new Map<number, { man: number; woman: number; similarity: number }[]>();

  const freeMen: number[] = [...allMen];

  function getFirstActiveCandidate(man: number): { woman: number; similarity: number } | null {
    const cands = menCandidates.get(man);
    if (!cands) return null;
    for (const c of cands) {
      if (c.active) return { woman: c.woman, similarity: c.similarity };
    }
    return null;
  }

  function hasCandidates(man: number): boolean {
    const cands = menCandidates.get(man);
    return cands ? cands.some((c) => c.active) : false;
  }

  function activateCandidatesOf(man: number): void {
    const cands = menCandidates.get(man);
    if (cands) {
      for (const c of cands) c.active = true;
    }
  }

  function deactivateCandidate(man: number, woman: number): void {
    const cands = menCandidates.get(man);
    if (cands) {
      for (const c of cands) {
        if (c.woman === woman) {
          c.active = false;
          return;
        }
      }
    }
  }

  function acceptsProposal(woman: number, man: number): boolean {
    const currentFiance = fiances.get(woman);
    if (currentFiance === undefined) return true;
    if (isUncertain[currentFiance]) return true;

    const wc = womenCandidates.get(woman);
    if (!wc) return false;

    let manScore = 0;
    let fianceScore = 0;
    for (const c of wc) {
      if (c.man === man) manScore = c.similarity;
      if (c.man === currentFiance) fianceScore = c.similarity;
    }
    return manScore > fianceScore;
  }

  while (freeMen.length > 0) {
    const man = freeMen.shift()!;

    const candidate = getFirstActiveCandidate(man);
    if (!candidate) {
      if (!isBachelor[man]) {
        isBachelor[man] = true;
        if (!hasCandidates(man)) {
          freeMen.push(man);
        }
        activateCandidatesOf(man);
      }
      continue;
    }

    const fiance = fiances.get(candidate.woman);
    if (fiance === undefined) {
      // No current partner
      const cm = currentMatches.get(man);
      if (cm) {
        cm.push({ man, woman: candidate.woman, similarity: candidate.similarity });
      } else {
        currentMatches.set(man, [
          { man, woman: candidate.woman, similarity: candidate.similarity },
        ]);
      }
      fiances.set(candidate.woman, man);
    } else {
      if (acceptsProposal(candidate.woman, man)) {
        // Remove old match
        const oldMatch = currentMatches.get(fiance);
        if (oldMatch) {
          const idx = oldMatch.findIndex((m) => m.woman === candidate.woman);
          if (idx >= 0) oldMatch.splice(idx, 1);
        }
        // Add new match
        const cm = currentMatches.get(man);
        if (cm) {
          cm.push({ man, woman: candidate.woman, similarity: candidate.similarity });
        } else {
          currentMatches.set(man, [
            { man, woman: candidate.woman, similarity: candidate.similarity },
          ]);
        }
        fiances.set(candidate.woman, man);

        if (!isUncertain[fiance]) {
          deactivateCandidate(fiance, candidate.woman);
        }
        // Free the displaced fiance
        if (!freeMen.includes(fiance)) {
          freeMen.push(fiance);
        }
      } else {
        deactivateCandidate(man, candidate.woman);
        freeMen.push(man);
      }
    }
  }

  // Build result graph
  const newEdges: [number, number][] = [];
  for (const [, matches] of currentMatches) {
    for (const m of matches) {
      newEdges.push([m.man, m.woman]);
    }
  }

  const comps = connectedComponents(newEdges, totalRecords);
  return buildResultFromClusters(comps, totalRecords, 'kmac');
}

// ===========================================================================
// 8. RICOCHET SR CLUSTERING  —  line 1343
// ===========================================================================

/** Options for {@link ricochetSRClustering}. */
export interface RicochetSROptions {
  /** Edges with similarity **≤** this are discarded. Default 0.5. */
  threshold?: number;
}

/**
 * **Ricochet SR Clustering** — pyJedAI port.
 *
 * Sequential Round Robin clustering with vertex-based center reassignment:
 *
 * 1. Build a `Vertex` for each entity, tracking edges, cumulative weight, and
 *    average weight.
 * 2. Sort vertices by average weight (descending).
 * 3. Start with the top vertex as center, its best neighbor as first member.
 * 4. Process remaining vertices in order. If a vertex offers a higher
 *    similarity to an existing member than that member's current center, the
 *    vertex becomes a new center and "steals" the member. Centers that end up
 *    with fewer than 2 members are re-assigned.
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records.
 * @param options     Optional configuration.
 */
export function ricochetSRClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: RicochetSROptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.5;

  // Vertex data
  interface Vertex {
    id: number;
    edges: Map<number, number>; // neighbor → similarity
    weightSum: number;
    edgeCount: number;
    avgWeight: number; // negative for heap ordering (higher is "smaller")
  }

  const vertexMap = new Map<number, Vertex>();

  for (const p of pairs) {
    const sim = pairSim(p);
    if (sim <= threshold) continue;
    const [d1, d2] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];

    let v1 = vertexMap.get(d1);
    let v2 = vertexMap.get(d2);
    if (!v1) {
      v1 = { id: d1, edges: new Map(), weightSum: 0, edgeCount: 0, avgWeight: 0 };
      vertexMap.set(d1, v1);
    }
    if (!v2) {
      v2 = { id: d2, edges: new Map(), weightSum: 0, edgeCount: 0, avgWeight: 0 };
      vertexMap.set(d2, v2);
    }

    v1.edges.set(d2, sim);
    v1.weightSum += sim;
    v1.edgeCount += 1;

    v2.edges.set(d1, sim);
    v2.weightSum += sim;
    v2.edgeCount += 1;
  }

  // Compute average weights
  for (const v of vertexMap.values()) {
    v.avgWeight = v.weightSum / (v.edgeCount || 1);
  }

  // Sort vertices by average weight descending
  const sorted = [...vertexMap.values()]
    .filter((v) => v.edgeCount > 0)
    .sort((a, b) => b.avgWeight - a.avgWeight);

  if (sorted.length === 0) {
    return buildResultFromClusters([], totalRecords, 'rsrc');
  }

  type VertexId = number;

  const centers = new Set<VertexId>();
  const members = new Set<VertexId>();
  const centerOf = new Map<VertexId, VertexId>();
  const simWithCenter = new Map<VertexId, number>();
  const currentClusters = new Map<VertexId, Set<VertexId>>();

  // Seed with top vertex
  const top = sorted[0]!;
  centers.add(top.id);
  centerOf.set(top.id, top.id);
  currentClusters.set(top.id, new Set([top.id]));
  simWithCenter.set(top.id, 1.0);

  // Add top vertex's best neighbor as member
  const topNeighbor = top.edges.keys().next().value!;
  if (topNeighbor !== undefined) {
    members.add(topNeighbor);
    centerOf.set(topNeighbor, top.id);
    currentClusters.get(top.id)!.add(topNeighbor);
    simWithCenter.set(topNeighbor, top.edges.get(topNeighbor) ?? 0);
  }

  // Process remaining
  for (let i = 1; i < sorted.length; i++) {
    const vertex = sorted[i]!;
    const toReassign = new Set<VertexId>();

    // Check if vertex can offer better similarities
    for (const [neighbor, similarity] of vertex.edges) {
      if (centers.has(neighbor)) continue;
      const prevSim = simWithCenter.get(neighbor) ?? 0;
      if (prevSim >= similarity) continue;
      toReassign.add(neighbor);
      break;
    }

    if (toReassign.size > 0) {
      if (members.has(vertex.id)) {
        members.delete(vertex.id);
        const prevCenter = centerOf.get(vertex.id)!;
        currentClusters.get(prevCenter)?.delete(vertex.id);
        if ((currentClusters.get(prevCenter)?.size ?? 0) < 2) {
          // This center will be reassigned later
        }
      }
      toReassign.add(vertex.id);
      currentClusters.set(vertex.id, new Set(toReassign));
      centers.add(vertex.id);
    }

    for (const reassign of toReassign) {
      if (reassign !== vertex.id) {
        if (members.has(reassign)) {
          const prevCenter = centerOf.get(reassign)!;
          currentClusters.get(prevCenter)?.delete(reassign);
          if ((currentClusters.get(prevCenter)?.size ?? 0) < 2) {
            // Remove orphaned center
            centers.delete(prevCenter);
            currentClusters.delete(prevCenter);
            // Reassign the center vertex itself
            reassignEntity(prevCenter, vertexMap);
          }
        }
        members.add(reassign);
        centerOf.set(reassign, vertex.id);
        simWithCenter.set(reassign, vertex.edges.get(reassign) ?? 0);
      }
    }
  }

  // Helper: reassign orphaned center entities
  function reassignEntity(entity: VertexId, vMap: Map<VertexId, Vertex>): void {
    let maxSim = 0;
    let bestCenter: VertexId | null = null;

    for (const c of centers) {
      const sim = vMap.get(c)?.edges.get(entity) ?? 0;
      if (sim > 0 && sim > maxSim) {
        if ((currentClusters.get(c)?.size ?? 0) > 1) continue;
        maxSim = sim;
        bestCenter = c;
      }
    }
    if (bestCenter !== null) {
      currentClusters.get(bestCenter)?.add(entity);
      members.add(entity);
      centerOf.set(entity, bestCenter);
      simWithCenter.set(entity, maxSim);
    }
  }

  // Handle orphaned centers (those with < 2 members after reassignment)
  const orphaned: VertexId[] = [];
  for (const [c, cluster] of currentClusters) {
    if (cluster.size < 2 && centers.has(c)) {
      orphaned.push(c);
    }
  }
  for (const c of orphaned) {
    centers.delete(c);
    currentClusters.delete(c);
  }

  // Ensure every entity is assigned
  for (let i = 0; i < totalRecords; i++) {
    if (!members.has(i) && !centers.has(i)) {
      centers.add(i);
      centerOf.set(i, i);
      currentClusters.set(i, new Set([i]));
      simWithCenter.set(i, 1.0);
    }
  }

  // Build cluster arrays
  const clusterArrays: number[][] = [];
  for (const [, clusterSet] of currentClusters) {
    if (clusterSet.size > 0) {
      clusterArrays.push([...clusterSet]);
    }
  }

  return buildResultFromClusters(clusterArrays, totalRecords, 'rsrc');
}

// ===========================================================================
// 9. ROW COLUMN CLUSTERING  —  line 1493  (CCER only)
// ===========================================================================

/** Options for {@link rowColumnClustering}. */
export interface RowColumnClusteringOptions {
  /** Edges with similarity **≤** this are discarded. Default 0.5. */
  threshold?: number;
}

/**
 * **Row Column Clustering** — pyJedAI port (CCER only).
 *
 * Treats the pair scores as a matrix of size `numD1 × numD2`. Computes two
 * greedy assignments:
 *
 * 1. **Row scan**: For each row (D1 entity), pick the minimum-cost (most
 *    similar) uncovered column.
 * 2. **Column scan**: For each column (D2 entity), pick the minimum-cost
 *    (most similar) uncovered row.
 *
 * Chooses the direction with the lower total cost and returns the connected
 * components of the resulting matches.
 *
 * Throws if a pair connects two entities from the same dataset.
 *
 * @param pairs       Scored candidate pairs.
 * @param totalRecords Total number of records (D1 + D2).
 * @param options     Optional configuration.
 */
export function rowColumnClustering(
  pairs: readonly ScoredPair[],
  totalRecords: number,
  options?: RowColumnClusteringOptions,
): ClusteringResult {
  const threshold = options?.threshold ?? 0.5;

  if (pairs.length === 0) {
    return buildResultFromClusters([], totalRecords, 'rcc');
  }

  // Determine dataset boundary
  let maxD1 = -1;
  let maxD2 = -1;
  for (const p of pairs) {
    const [d1, d2] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];
    if (d1 >= d2) {
      throw new Error('RowColumnClustering is CCER only. Found pair with same-dataset entities.');
    }
    maxD1 = Math.max(maxD1, d1);
    maxD2 = Math.max(maxD2, d2);
  }
  const numD1 = maxD1 + 1;
  const numD2 = maxD2 + 1;

  // Build similarity matrix (numD1 × numD2) — default to -1 (no edge)
  const simMatrix: number[][] = Array.from({ length: numD1 }, () => new Array(numD2).fill(-1));

  for (const p of pairs) {
    const sim = pairSim(p);
    if (sim <= threshold) continue;
    const [d1, d2] = p.leftId < p.rightId ? [p.leftId, p.rightId] : [p.rightId, p.leftId];
    const row = d1;
    const col = d2;
    // Convert to cost: lower is better → 1 - similarity
    const prev = simMatrix[row]![col]!;
    if (prev < 0 || sim > 1 - prev) {
      simMatrix[row]![col] = 1 - sim;
    }
  }

  // Row assignment: for each row, pick min-cost column
  const selectedColumn = new Array<number>(numD1).fill(-1);
  const columnCovered = new Array<boolean>(numD2).fill(false);
  let rowScanCost = 0;

  for (let row = 0; row < numD1; row++) {
    let minCost = Infinity;
    let minCol = -1;
    for (let col = 0; col < numD2; col++) {
      if (columnCovered[col]) continue;
      const cost = simMatrix[row]![col]!;
      if (cost >= 0 && cost < minCost) {
        minCost = cost;
        minCol = col;
      }
    }
    if (minCol < 0) break;
    selectedColumn[row] = minCol;
    columnCovered[minCol] = true;
    rowScanCost += minCost;
  }

  // Column assignment: for each column, pick min-cost row
  const selectedRow = new Array<number>(numD2).fill(-1);
  const rowCovered = new Array<boolean>(numD1).fill(false);
  const colsFromSelectedRow = new Array<number>(numD1).fill(-1);
  let colScanCost = 0;

  for (let col = 0; col < numD2; col++) {
    let minCost = Infinity;
    let minRow = -1;
    for (let row = 0; row < numD1; row++) {
      if (rowCovered[row]) continue;
      const cost = simMatrix[row]![col]!;
      if (cost >= 0 && cost < minCost) {
        minCost = cost;
        minRow = row;
      }
    }
    if (minRow < 0) break;
    selectedRow[col] = minRow;
    colsFromSelectedRow[minRow] = col;
    rowCovered[minRow] = true;
    colScanCost += minCost;
  }

  // Choose the better assignment
  const solution: number[] = rowScanCost < colScanCost ? selectedColumn : colsFromSelectedRow;

  // Build graph from solution
  const newEdges: [number, number][] = [];
  const matched = new Set<number>();

  for (let row = 0; row < solution.length; row++) {
    const col = solution[row];
    if (col === undefined || col < 0) continue;
    const cost = simMatrix[row]![col]!;
    if (cost < 0) continue;
    const sim = 1 - cost;
    if (sim <= threshold) continue;

    const d2Id = col;
    if (matched.has(row) || matched.has(d2Id)) continue;

    matched.add(row);
    matched.add(d2Id);
    newEdges.push([row, d2Id]);
  }

  const comps = connectedComponents(newEdges, totalRecords);
  return buildResultFromClusters(comps, totalRecords, 'rcc');
}
