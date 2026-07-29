/**
 * Interactive Labeling Data API — Layer 1.
 *
 * Pure JSON functions for building labeling sessions from scored pairs.
 * Zero rendering dependencies. Framework-agnostic.
 *
 * Names prefixed 'labeling' to avoid collisions with core's active-learning
 * module when re-exported through the umbrella package.
 */
import type { ScoredPair } from '@agentix-e/entity-resolver-core';

export interface LabelingPair {
  readonly id: string;
  readonly left: Record<string, unknown>;
  readonly right: Record<string, unknown>;
  readonly machineScore: number;
  readonly fieldScores: readonly FieldScore[];
  label: boolean | null;
  labeledAt: number | null;
}

export interface FieldScore {
  readonly fieldName: string;
  readonly leftValue: unknown;
  readonly rightValue: unknown;
  readonly score: number;
}

export interface LabelingBatch {
  readonly pairs: readonly LabelingPair[];
  readonly batchNumber: number;
  readonly totalBatches: number;
  readonly sessionProgress: number;
}

export interface LabelingSession {
  readonly sessionId: string;
  readonly pairs: LabelingPair[];
  readonly totalCount: number;
  readonly batchSize: number;
}

/** Create a labeling session from scored pairs, selecting most uncertain first. */
export function labelingCreateSession(
  scoredPairs: readonly ScoredPair[],
  records: readonly Record<string, unknown>[],
  batchSize = 10,
  maxPairs = 200,
): LabelingSession {
  const sessionId = `erl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const uncertainPairs = scoredPairs
    .map((p) => ({ pair: p, u: 1 - Math.abs(2 * (p.probability ?? p.score) - 1) }))
    .sort((a, b) => b.u - a.u)
    .slice(0, maxPairs)
    .map((e) => e.pair);

  const pairs: LabelingPair[] = uncertainPairs.map((pair, i) => ({
    id: `p${i}`,
    left: records[pair.leftId] ?? {},
    right: records[pair.rightId] ?? {},
    machineScore: pair.probability ?? pair.score,
    fieldScores: fieldScores(records[pair.leftId] ?? {}, records[pair.rightId] ?? {}),
    label: null,
    labeledAt: null,
  }));

  return { sessionId, pairs, totalCount: pairs.length, batchSize };
}

/** Get the next batch of unlabeled pairs, or null if done. */
export function labelingNextBatch(session: LabelingSession): LabelingBatch | null {
  const unlabeled = session.pairs.filter((p) => p.label === null);
  if (unlabeled.length === 0) return null;
  const batch = unlabeled.slice(0, session.batchSize);
  const done = session.pairs.filter((p) => p.label !== null).length;
  return {
    pairs: batch,
    batchNumber: Math.floor(done / session.batchSize) + 1,
    totalBatches: Math.ceil(session.totalCount / session.batchSize),
    sessionProgress: session.totalCount > 0 ? done / session.totalCount : 0,
  };
}

/** Apply human labels to pairs. Only sets label if currently null. */
export function labelingApply(
  session: LabelingSession,
  labels: readonly { pairId: string; isMatch: boolean }[],
): void {
  const map = new Map(labels.map((l) => [l.pairId, l.isMatch]));
  for (const p of session.pairs) {
    const v = map.get(p.id);
    if (v !== undefined && p.label === null) {
      p.label = v;
      p.labeledAt = Date.now();
    }
  }
}

/** Reset all labels. */
export function labelingReset(session: LabelingSession): void {
  for (const p of session.pairs) {
    p.label = null;
    p.labeledAt = null;
  }
}

/** Compute per-field similarity scores for diff highlighting. */
function fieldScores(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): FieldScore[] {
  const fields = new Set([...Object.keys(left), ...Object.keys(right)]);
  const scores: FieldScore[] = [];
  for (const f of fields) {
    const lv = left[f] ?? '';
    const rv = right[f] ?? '';
    if (lv === '' && rv === '') continue;
    let s = 1.0;
    if (typeof lv === 'string' && typeof rv === 'string') {
      const a = bigrams(lv.toLowerCase());
      const b = bigrams(rv.toLowerCase());
      const inter = a.filter((x) => b.includes(x)).length;
      const uni = new Set([...a, ...b]).size;
      s = uni > 0 ? inter / uni : 0;
    } else {
      s = lv === rv ? 1.0 : 0.0;
    }
    scores.push({ fieldName: f, leftValue: lv, rightValue: rv, score: s });
  }
  return scores;
}

function bigrams(str: string): string[] {
  const b: string[] = [];
  for (let i = 0; i < str.length - 1; i++) b.push(str.slice(i, i + 2));
  return b;
}
