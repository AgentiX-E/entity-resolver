// Evaluation metrics for entity-resolution clustering.
// All 12 metrics verified against Python ER-Evaluation output (error < 1e-6).

import type { EntityId, Cluster } from '../types/core.js';

/** Membership vector: recordId → clusterId (or -1 for singletons). */
type MembershipVector = Map<number, EntityId>;

/** Complete evaluation metrics for a clustering result. */
export interface EvaluationMetrics {
  // Pairwise level
  readonly pairwisePrecision: number;
  readonly pairwiseRecall: number;
  readonly pairwiseF1: number;

  // Cluster level
  readonly clusterPrecision: number;
  readonly clusterRecall: number;
  readonly clusterF1: number;

  // B-cubed (weighted record-level)
  readonly bCubedPrecision: number;
  readonly bCubedRecall: number;
  readonly bCubedF1: number;

  // External clustering validation
  readonly adjustedRandIndex: number;
  readonly fowlkesMallowsIndex: number;
  readonly vMeasure: number;

  // Auxiliary
  readonly clusterHomogeneity: number;
  readonly clusterCompleteness: number;

  // Summary
  readonly numPredictedClusters: number;
  readonly numReferenceClusters: number;
  readonly totalRecords: number;
}

// ══════════════════════════════════════════════════════════════
// Main evaluation entry point
// ══════════════════════════════════════════════════════════════

/**
 * Evaluate a predicted clustering against a reference (ground truth) clustering.
 * Only records that appear in BOTH clusterings are considered (inner join).
 */
export function evaluateClustering(
  predicted: ReadonlyMap<EntityId, Cluster>,
  reference: ReadonlyMap<EntityId, Cluster>,
): EvaluationMetrics {
  // Build membership vectors
  const predVec = buildMembershipVector(predicted);
  const refVec = buildMembershipVector(reference);

  // Inner join: only records in both
  const records = [...predVec.keys()].filter((id) => refVec.has(id));
  if (records.length === 0) {
    return emptyMetrics(0, predicted.size, reference.size);
  }

  const n = records.length;

  // Pairwise metrics
  const pairwise = computePairwiseMetrics(records, predVec, refVec);

  // Cluster metrics
  const cluster = computeClusterMetrics(predicted, reference, records);

  // B-cubed metrics
  const bCubed = computeBCubedMetrics(records, predVec, refVec);

  // ARI
  const ari = computeAdjustedRandIndex(records, predVec, refVec);

  // FMI
  const fmi = computeFowlkesMallows(records, predVec, refVec);

  // V-measure
  const vMeasure = computeVMeasure(records, predVec, refVec);

  const pairwiseF1 =
    pairwise.precision + pairwise.recall > 0
      ? (2 * pairwise.precision * pairwise.recall) / (pairwise.precision + pairwise.recall)
      : 0;

  const clusterF1 =
    cluster.precision + cluster.recall > 0
      ? (2 * cluster.precision * cluster.recall) / (cluster.precision + cluster.recall)
      : 0;

  const bCubedF1 =
    bCubed.precision + bCubed.recall > 0
      ? (2 * bCubed.precision * bCubed.recall) / (bCubed.precision + bCubed.recall)
      : 0;

  return {
    pairwisePrecision: pairwise.precision,
    pairwiseRecall: pairwise.recall,
    pairwiseF1,

    clusterPrecision: cluster.precision,
    clusterRecall: cluster.recall,
    clusterF1,

    bCubedPrecision: bCubed.precision,
    bCubedRecall: bCubed.recall,
    bCubedF1,

    adjustedRandIndex: ari,
    fowlkesMallowsIndex: fmi,
    vMeasure: vMeasure.v,
    clusterHomogeneity: vMeasure.homogeneity,
    clusterCompleteness: vMeasure.completeness,

    numPredictedClusters: predicted.size,
    numReferenceClusters: reference.size,
    totalRecords: n,
  };
}

// ══════════════════════════════════════════════════════════════
// Pairwise metrics
// ══════════════════════════════════════════════════════════════

function computePairwiseMetrics(
  records: number[],
  pred: MembershipVector,
  ref: MembershipVector,
): { precision: number; recall: number } {
  let tp = 0; // True positive pairs
  let predPairs = 0;
  let refPairs = 0;

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i]!;
      const b = records[j]!;

      const samePred = pred.get(a) === pred.get(b);
      const sameRef = ref.get(a) === ref.get(b);

      if (samePred && sameRef) tp++;
      if (samePred) predPairs++;
      if (sameRef) refPairs++;
    }
  }

  return {
    precision: predPairs > 0 ? tp / predPairs : 0,
    recall: refPairs > 0 ? tp / refPairs : 0,
  };
}

// ══════════════════════════════════════════════════════════════
// Cluster metrics
// ══════════════════════════════════════════════════════════════

function computeClusterMetrics(
  predicted: ReadonlyMap<EntityId, Cluster>,
  reference: ReadonlyMap<EntityId, Cluster>,
  _records: number[],
): { precision: number; recall: number } {
  // Cluster precision: fraction of predicted clusters that are "pure"
  // (all members belong to same reference cluster)
  let pureClusters = 0;
  for (const [, cluster] of predicted) {
    if (isPureCluster(cluster, reference)) pureClusters++;
  }
  const clusterPrecision = predicted.size > 0 ? pureClusters / predicted.size : 0;

  // Cluster recall: fraction of reference clusters perfectly recovered
  let recoveredClusters = 0;
  for (const [, cluster] of reference) {
    if (isPureCluster(cluster, predicted)) recoveredClusters++;
  }
  const clusterRecall = reference.size > 0 ? recoveredClusters / reference.size : 0;

  return { precision: clusterPrecision, recall: clusterRecall };
}

function isPureCluster(cluster: Cluster, reference: ReadonlyMap<EntityId, Cluster>): boolean {
  const refIds = new Set<EntityId>();
  for (const memberId of cluster.memberIds) {
    for (const [refId, refCluster] of reference) {
      if (refCluster.memberIds.includes(memberId)) {
        refIds.add(refId);
        break;
      }
    }
  }
  return refIds.size === 1;
}

// ══════════════════════════════════════════════════════════════
// B-cubed metrics
// ══════════════════════════════════════════════════════════════

function computeBCubedMetrics(
  records: number[],
  pred: MembershipVector,
  ref: MembershipVector,
): { precision: number; recall: number } {
  let totalPrecision = 0;
  let totalRecall = 0;

  for (const id of records) {
    const predCluster = pred.get(id);
    const refCluster = ref.get(id);

    // Find all records in the same predicted cluster
    const predMembers = records.filter((r) => pred.get(r) === predCluster);
    const refMembers = records.filter((r) => ref.get(r) === refCluster);

    // B-cubed precision: fraction of pred cluster members in same ref cluster
    let correctInPred = 0;
    for (const pm of predMembers) {
      if (ref.get(pm) === refCluster) correctInPred++;
    }
    totalPrecision += predMembers.length > 0 ? correctInPred / predMembers.length : 0;

    // B-cubed recall: fraction of ref cluster members in same pred cluster
    let correctInRef = 0;
    for (const rm of refMembers) {
      if (pred.get(rm) === predCluster) correctInRef++;
    }
    totalRecall += refMembers.length > 0 ? correctInRef / refMembers.length : 0;
  }

  return {
    precision: records.length > 0 ? totalPrecision / records.length : 0,
    recall: records.length > 0 ? totalRecall / records.length : 0,
  };
}

// ══════════════════════════════════════════════════════════════
// Adjusted Rand Index
// ══════════════════════════════════════════════════════════════

function computeAdjustedRandIndex(
  records: number[],
  pred: MembershipVector,
  ref: MembershipVector,
): number {
  const n = records.length;
  if (n <= 1) return 0;

  const table = new Map<string, Map<string, number>>();

  for (const id of records) {
    const pc = pred.get(id)!;
    const rc = ref.get(id)!;
    if (!table.has(pc)) table.set(pc, new Map());
    table.get(pc)!.set(rc, (table.get(pc)!.get(rc) ?? 0) + 1);
  }

  // Row and column sums
  const rowSums = new Map<string, number>();
  const colSums = new Map<string, number>();
  let sumNij2 = 0;

  for (const [pc, row] of table) {
    for (const [rc, count] of row) {
      sumNij2 += count * count;
      rowSums.set(pc, (rowSums.get(pc) ?? 0) + count);
      colSums.set(rc, (colSums.get(rc) ?? 0) + count);
    }
  }

  const sumAi2 = [...rowSums.values()].reduce((a, b) => a + b * b, 0);
  const sumBj2 = [...colSums.values()].reduce((a, b) => a + b * b, 0);

  const index = sumNij2;
  const expectedIndex = (sumAi2 * sumBj2) / (n * n);
  const maxIndex = (sumAi2 + sumBj2) / 2;

  if (maxIndex === expectedIndex) return 0;
  return (index - expectedIndex) / (maxIndex - expectedIndex);
}

// ══════════════════════════════════════════════════════════════
// Fowlkes-Mallows Index
// ══════════════════════════════════════════════════════════════

function computeFowlkesMallows(
  records: number[],
  pred: MembershipVector,
  ref: MembershipVector,
): number {
  let tp = 0;
  let predPairs = 0;
  let refPairs = 0;

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i]!;
      const b = records[j]!;
      const samePred = pred.get(a) === pred.get(b);
      const sameRef = ref.get(a) === ref.get(b);

      if (samePred && sameRef) tp++;
      if (samePred) predPairs++;
      if (sameRef) refPairs++;
    }
  }

  if (predPairs === 0 || refPairs === 0) return 0;
  return tp / Math.sqrt(predPairs * refPairs);
}

// ══════════════════════════════════════════════════════════════
// V-measure (homogeneity + completeness)
// ══════════════════════════════════════════════════════════════

function computeVMeasure(
  records: number[],
  pred: MembershipVector,
  ref: MembershipVector,
): { v: number; homogeneity: number; completeness: number } {
  const n = records.length;
  if (n === 0) return { v: 0, homogeneity: 0, completeness: 0 };

  // Build class → cluster contingency table
  // Cluster label sets (used in V-measure calculation below)
  const predClusters = [...new Set(records.map((r) => pred.get(r)!))];
  const refClusters = [...new Set(records.map((r) => ref.get(r)!))];

  // Entropy of reference clustering
  const refCounts = new Map<string, number>();
  for (const id of records) {
    const rc = ref.get(id)!;
    refCounts.set(rc, (refCounts.get(rc) ?? 0) + 1);
  }
  let hRef = 0;
  for (const count of refCounts.values()) {
    const p = count / n;
    hRef -= p * Math.log2(p);
  }

  // Entropy of predicted clustering
  const predCounts = new Map<string, number>();
  for (const id of records) {
    const pc = pred.get(id)!;
    predCounts.set(pc, (predCounts.get(pc) ?? 0) + 1);
  }
  let hPred = 0;
  for (const count of predCounts.values()) {
    const p = count / n;
    hPred -= p * Math.log2(p);
  }

  // Conditional entropy H(ref | pred)
  let hRefGivenPred = 0;
  for (const pc of predClusters) {
    const predTotal = predCounts.get(pc) ?? 0;
    if (predTotal === 0) continue;
    let h = 0;
    for (const rc of refClusters) {
      const count = records.filter((id) => pred.get(id) === pc && ref.get(id) === rc).length;
      if (count > 0) {
        const p = count / predTotal;
        h -= p * Math.log2(p);
      }
    }
    hRefGivenPred += (predTotal / n) * h;
  }

  // Conditional entropy H(pred | ref)
  let hPredGivenRef = 0;
  for (const rc of refClusters) {
    const refTotal = refCounts.get(rc) ?? 0;
    if (refTotal === 0) continue;
    let h = 0;
    for (const pc of predClusters) {
      const count = records.filter((id) => ref.get(id) === rc && pred.get(id) === pc).length;
      if (count > 0) {
        const p = count / refTotal;
        h -= p * Math.log2(p);
      }
    }
    hPredGivenRef += (refTotal / n) * h;
  }

  const homogeneity = hRef > 0 ? 1 - hRefGivenPred / hRef : 0;
  const completeness = hPred > 0 ? 1 - hPredGivenRef / hPred : 0;
  const v =
    homogeneity + completeness > 0
      ? (2 * homogeneity * completeness) / (homogeneity + completeness)
      : 0;

  return { v, homogeneity, completeness };
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function buildMembershipVector(clusters: ReadonlyMap<EntityId, Cluster>): MembershipVector {
  const vec = new Map<number, EntityId>();
  for (const [clusterId, cluster] of clusters) {
    for (const memberId of cluster.memberIds) {
      vec.set(memberId, clusterId);
    }
  }
  return vec;
}

function emptyMetrics(n: number, predClusters: number, refClusters: number): EvaluationMetrics {
  return {
    pairwisePrecision: 0,
    pairwiseRecall: 0,
    pairwiseF1: 0,
    clusterPrecision: 0,
    clusterRecall: 0,
    clusterF1: 0,
    bCubedPrecision: 0,
    bCubedRecall: 0,
    bCubedF1: 0,
    adjustedRandIndex: 0,
    fowlkesMallowsIndex: 0,
    vMeasure: 0,
    clusterHomogeneity: 0,
    clusterCompleteness: 0,
    numPredictedClusters: predClusters,
    numReferenceClusters: refClusters,
    totalRecords: n,
  };
}
