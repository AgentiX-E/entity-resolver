/**
 * Studio Labeling Session — Core logic for interactive record pair labeling.
 *
 * Depends on:
 *   - @agentix-e/entity-resolver-core (selectUncertainPairs, trainClassifier)
 *   - @agentix-e/entity-resolver-browser (IndexedDB persistence)
 *
 * Pure logic, no DOM dependencies. The Web Components in components/ consume this.
 */
import type { ScoredPair } from '@agentix-e/entity-resolver-core';

export interface StudioPair {
  id: string;
  left: Record<string, unknown>;
  right: Record<string, unknown>;
  machineScore: number;
  fieldScores: readonly FieldScore[];
  label: boolean | null;
  labeledAt: number | null;
}

export interface FieldScore {
  fieldName: string;
  leftValue: unknown;
  rightValue: unknown;
  score: number;
}

export interface StudioBatch {
  pairs: readonly StudioPair[];
  batchNumber: number;
  totalBatches: number;
  progress: number;
}

export interface StudioSession {
  sessionId: string;
  pairs: StudioPair[];
  totalCount: number;
  batchSize: number;
}

export function createStudioSession(
  scoredPairs: readonly ScoredPair[],
  records: readonly Record<string, unknown>[],
  batchSize = 10,
  maxPairs = 200,
): StudioSession {
  const id = `erls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const uncertain = scoredPairs
    .map((p) => ({ pair: p, u: 1 - Math.abs(2 * (p.probability ?? p.score) - 1) }))
    .sort((a, b) => b.u - a.u)
    .slice(0, maxPairs)
    .map((e) => e.pair);

  const pairs: StudioPair[] = uncertain.map((pair, i) => ({
    id: `sp${i}`,
    left: records[pair.leftId] ?? {},
    right: records[pair.rightId] ?? {},
    machineScore: pair.probability ?? pair.score,
    fieldScores: diffFields(records[pair.leftId] ?? {}, records[pair.rightId] ?? {}),
    label: null,
    labeledAt: null,
  }));

  return { sessionId: id, pairs, totalCount: pairs.length, batchSize };
}

export function studioNextBatch(session: StudioSession): StudioBatch | null {
  const unlabeled = session.pairs.filter((p) => p.label === null);
  if (unlabeled.length === 0) return null;
  const batch = unlabeled.slice(0, session.batchSize);
  const done = session.pairs.filter((p) => p.label !== null).length;
  return {
    pairs: batch,
    batchNumber: Math.floor(done / session.batchSize) + 1,
    totalBatches: Math.ceil(session.totalCount / session.batchSize),
    progress: session.totalCount > 0 ? done / session.totalCount : 0,
  };
}

export function studioApply(
  session: StudioSession,
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

export function studioReset(session: StudioSession): void {
  for (const p of session.pairs) {
    p.label = null;
    p.labeledAt = null;
  }
}

function diffFields(left: Record<string, unknown>, right: Record<string, unknown>): FieldScore[] {
  const fields = new Set([...Object.keys(left), ...Object.keys(right)]);
  const scores: FieldScore[] = [];
  for (const f of fields) {
    const lv = typeof left[f] === 'string' ? left[f] : '';
    const rv = typeof right[f] === 'string' ? right[f] : '';
    if (lv === '' && rv === '') continue;
    let s: number;
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
