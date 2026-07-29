/**
 * Interactive Labeling State Machine — Layer 2 (renderless logic).
 */
import type { LabelingSession, LabelingBatch } from './api.js';
import { labelingCreateSession, labelingNextBatch, labelingApply, labelingReset } from './api.js';
import type { ScoredPair } from '@agentix-e/entity-resolver-core';

export interface LabelingShortcuts {
  match: string;
  noMatch: string;
  skip: string;
  undo: string;
  next: string;
  prev: string;
}

export const DEFAULT_SHORTCUTS: LabelingShortcuts = {
  match: 'y', noMatch: 'n', skip: 's', undo: 'u',
  next: 'ArrowDown', prev: 'ArrowUp',
};

export interface LabelingState {
  session: LabelingSession | null;
  currentBatch: LabelingBatch | null;
  isComplete: boolean;
  shortcuts: LabelingShortcuts;
  selectedIndex: number;
}

export type LabelingActions = {
  start: (pairs: readonly ScoredPair[], recs: readonly Record<string, unknown>[], size?: number) => void;
  markMatch: () => void;
  markNoMatch: () => void;
  skip: () => void;
  undo: () => void;
  next: () => void;
  prev: () => void;
  nextBatch: () => void;
  reset: () => void;
};

function currentPair(s: LabelingState) {
  return s.currentBatch?.pairs[s.selectedIndex] ?? null;
}

export function createLabelingMachine(
  onChange: (s: LabelingState) => void,
): { state: LabelingState; actions: LabelingActions } {
  const state: LabelingState = {
    session: null, currentBatch: null, isComplete: false,
    shortcuts: { ...DEFAULT_SHORTCUTS }, selectedIndex: 0,
  };
  const emit = () => onChange(structuredClone(state));

  return {
    state,
    actions: {
      start(pairs, recs, size) {
        state.session = labelingCreateSession(pairs, recs, size);
        state.currentBatch = labelingNextBatch(state.session);
        state.selectedIndex = 0;
        state.isComplete = false;
        emit();
      },
      markMatch() {
        const p = currentPair(state);
        if (p && state.session) labelingApply(state.session, [{ pairId: p.id, isMatch: true }]);
        emit();
      },
      markNoMatch() {
        const p = currentPair(state);
        if (p && state.session) labelingApply(state.session, [{ pairId: p.id, isMatch: false }]);
        emit();
      },
      skip() {
        if (state.currentBatch && state.selectedIndex < state.currentBatch.pairs.length - 1) {
          state.selectedIndex++;
        }
        emit();
      },
      undo() {
        if (!state.session) return;
        for (let i = state.session.pairs.length - 1; i >= 0; i--) {
          const p = state.session.pairs[i]!;
          if (p.label !== null) { p.label = null; p.labeledAt = null; break; }
        }
        state.currentBatch = labelingNextBatch(state.session);
        state.isComplete = false;
        emit();
      },
      next() {
        if (state.currentBatch && state.selectedIndex < state.currentBatch.pairs.length - 1) {
          state.selectedIndex++;
          emit();
        }
      },
      prev() {
        if (state.selectedIndex > 0) { state.selectedIndex--; emit(); }
      },
      nextBatch() {
        if (!state.session) return;
        state.currentBatch = labelingNextBatch(state.session);
        state.selectedIndex = 0;
        if (!state.currentBatch) state.isComplete = true;
        emit();
      },
      reset() {
        if (!state.session) return;
        labelingReset(state.session);
        state.currentBatch = labelingNextBatch(state.session);
        state.selectedIndex = 0;
        state.isComplete = false;
        emit();
      },
    },
  };
}
