// Incremental update engine for entity-resolver.
// Handles adding, modifying, and deleting records without full re-computation.
// Each operation accepts record data directly — the engine is stateless,
// relying on the caller to provide current state.

import type { ScoredPair, RawRecord } from '../types/core.js';
import type { ClusteringResult } from '../clustering/algorithms.js';
import { connectedComponents } from '../clustering/algorithms.js';

/** Interface for incremental update operations. */

/**
 * Incrementally add new records to an existing clustering.
 *
 * Compares each new record against every existing record using `matchFn`,
 * appends the scored pairs, and re-clusters the combined set.
 *
 * @param newRecords - Records being added
 * @param existingRecords - All existing records (for pairwise comparison)
 * @param existingResult - Current clustering result
 * @param existingPairs - All existing scored pairs
 * @param matchFn - Async function that computes ScoredPair for two records
 * @param threshold - Clustering threshold for connected components
 * @returns Updated clustering result with new records integrated
 */
export async function incrementalAdd(
  newRecords: RawRecord[],
  existingRecords: RawRecord[],
  existingResult: ClusteringResult,
  existingPairs: ScoredPair[],
  matchFn: (a: RawRecord, b: RawRecord) => Promise<ScoredPair>,
  threshold: number,
): Promise<ClusteringResult> {
  if (newRecords.length === 0) return existingResult;

  const oldCount = existingRecords.length;
  const totalCount = oldCount + newRecords.length;

  if (oldCount === 0) {
    // First batch — full pairwise computation among new records
    const newPairs = await generatePairs(newRecords, 0, matchFn);
    return connectedComponents(newPairs, totalCount, threshold);
  }

  // Compare each new record against each existing record
  const incrementalPairs: ScoredPair[] = [];
  for (let ni = 0; ni < newRecords.length; ni++) {
    for (let oi = 0; oi < oldCount; oi++) {
      const pair = await matchFn(newRecords[ni]!, existingRecords[oi]!);
      incrementalPairs.push({
        ...pair,
        leftId: oi,
        rightId: oldCount + ni,
      });
    }
  }

  // Compute pairwise comparisons among new records themselves
  const newInternalPairs = await generatePairs(newRecords, oldCount, matchFn);

  const allPairs = [...existingPairs, ...incrementalPairs, ...newInternalPairs];
  return connectedComponents(allPairs, totalCount, threshold);
}

/**
 * Incrementally delete records from an existing clustering.
 *
 * Removes all pairs involving deleted record IDs, remaps IDs to compact
 * range, and re-clusters the remaining pairs.
 *
 * @param deletedIds - Record IDs to delete (refer to original ID space)
 * @param existingResult - Current clustering result
 * @param existingPairs - All existing scored pairs
 * @param threshold - Clustering threshold
 * @returns Updated clustering result with deleted records removed
 */
export function incrementalDelete(
  deletedIds: readonly number[],
  existingResult: ClusteringResult,
  existingPairs: ScoredPair[],
  threshold: number,
): ClusteringResult {
  if (deletedIds.length === 0) return existingResult;

  const deletedSet = new Set(deletedIds);

  // Filter out pairs involving deleted records
  const remainingPairs = existingPairs.filter(
    (p) => !deletedSet.has(p.leftId) && !deletedSet.has(p.rightId),
  );

  // Re-map IDs to compact range
  const oldToNew = new Map<number, number>();
  let nextId = 0;
  for (let i = 0; i < existingResult.metadata.totalRecords; i++) {
    if (!deletedSet.has(i)) {
      oldToNew.set(i, nextId++);
    }
  }

  const remappedPairs = remainingPairs.map((p) => ({
    ...p,
    leftId: oldToNew.get(p.leftId) ?? p.leftId,
    rightId: oldToNew.get(p.rightId) ?? p.rightId,
  }));

  return connectedComponents(remappedPairs, nextId, threshold);
}

/**
 * Incrementally modify records in an existing clustering.
 *
 * Drops all edges involving modified records, then re-compares each
 * modified record against ALL other records (both modified and unmodified).
 *
 * @param modifiedIds - Record IDs that were modified
 * @param allRecords - All records in current state (after modifications)
 * @param existingPairs - All existing scored pairs (before modifications)
 * @param matchFn - Async function to compute new ScoredPairs
 * @param threshold - Clustering threshold
 * @returns Updated clustering result with modified edges re-computed
 */
export async function incrementalModify(
  modifiedIds: readonly number[],
  allRecords: RawRecord[],
  existingPairs: ScoredPair[],
  matchFn: (a: RawRecord, b: RawRecord) => Promise<ScoredPair>,
  threshold: number,
): Promise<ClusteringResult> {
  const totalRecords = allRecords.length;

  if (modifiedIds.length === 0 || totalRecords === 0) {
    return connectedComponents(existingPairs, totalRecords, threshold);
  }

  const modSet = new Set(modifiedIds);

  // Keep pairs where neither record is modified
  const keptPairs = existingPairs.filter((p) => !modSet.has(p.leftId) && !modSet.has(p.rightId));

  // Re-compute: compare each modified record against every record
  const recomputedPairs: ScoredPair[] = [];
  const allIds = Array.from({ length: totalRecords }, (_, i) => i);

  for (const modId of modifiedIds) {
    for (const otherId of allIds) {
      // Skip self-pairs
      if (modId >= otherId) continue;

      const pair = await matchFn(allRecords[modId]!, allRecords[otherId]!);
      recomputedPairs.push({
        ...pair,
        leftId: Math.min(modId, otherId),
        rightId: Math.max(modId, otherId),
      });
    }
  }

  const allPairs = [...keptPairs, ...recomputedPairs];
  return connectedComponents(allPairs, totalRecords, threshold);
}

/**
 * Generate all pairwise comparisons within a set of records.
 * Pairs are assigned IDs starting from `idOffset`.
 */
async function generatePairs(
  records: RawRecord[],
  idOffset: number,
  matchFn: (a: RawRecord, b: RawRecord) => Promise<ScoredPair>,
): Promise<ScoredPair[]> {
  const n = records.length;
  const pairs: ScoredPair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pair = await matchFn(records[i]!, records[j]!);
      pairs.push({
        ...pair,
        leftId: idOffset + i,
        rightId: idOffset + j,
      });
    }
  }
  return pairs;
}
