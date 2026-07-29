/**
 * Studio Labeling State Machine.
 *
 * Reactive state management for the interactive labeling workflow.
 * Consumers subscribe to state changes and dispatch actions via keyboard
 * or mouse. Built on studio session primitives (session.ts).
 */
import type { StudioSession, StudioBatch } from './session.js';
import { createStudioSession, studioNextBatch, studioApply, studioReset } from './session.js';
import type { ScoredPair } from '@agentix-e/entity-resolver-core';

export interface StudioState {
  session: StudioSession | null;
  batch: StudioBatch | null;
  isComplete: boolean;
  selectedIndex: number;
}

export type StudioAction =
  | {
      type: 'start';
      pairs: readonly ScoredPair[];
      records: readonly Record<string, unknown>[];
      batchSize?: number;
    }
  | { type: 'match' }
  | { type: 'noMatch' }
  | { type: 'skip' }
  | { type: 'undo' }
  | { type: 'selectNext' }
  | { type: 'selectPrev' }
  | { type: 'nextBatch' }
  | { type: 'reset' };

export function createStudioMachine(onChange: (state: StudioState) => void): {
  state: StudioState;
  dispatch: (action: StudioAction) => void;
} {
  const state: StudioState = {
    session: null,
    batch: null,
    isComplete: false,
    selectedIndex: 0,
  };

  const emit = () => onChange({ ...state });

  function currentPair(): StudioBatch['pairs'][number] | null {
    return state.batch?.pairs[state.selectedIndex] ?? null;
  }

  function refreshBatch(): void {
    if (!state.session) return;
    state.batch = studioNextBatch(state.session);
    state.selectedIndex = 0;
    if (!state.batch) state.isComplete = true;
  }

  function dispatch(action: StudioAction): void {
    switch (action.type) {
      case 'start': {
        state.session = createStudioSession(action.pairs, action.records, action.batchSize);
        refreshBatch();
        break;
      }
      case 'match': {
        const p = currentPair();
        if (p && state.session) studioApply(state.session, [{ pairId: p.id, isMatch: true }]);
        break;
      }
      case 'noMatch': {
        const p = currentPair();
        if (p && state.session) studioApply(state.session, [{ pairId: p.id, isMatch: false }]);
        break;
      }
      case 'skip': {
        if (state.batch && state.selectedIndex < state.batch.pairs.length - 1) {
          state.selectedIndex++;
        }
        break;
      }
      case 'selectNext': {
        if (state.batch && state.selectedIndex < state.batch.pairs.length - 1) {
          state.selectedIndex++;
        }
        break;
      }
      case 'selectPrev': {
        if (state.selectedIndex > 0) state.selectedIndex--;
        break;
      }
      case 'undo': {
        if (!state.session) break;
        for (let i = state.session.pairs.length - 1; i >= 0; i--) {
          const p = state.session.pairs[i]!;
          if (p.label !== null) {
            p.label = null;
            p.labeledAt = null;
            break;
          }
        }
        refreshBatch();
        break;
      }
      case 'nextBatch': {
        refreshBatch();
        break;
      }
      case 'reset': {
        if (state.session) studioReset(state.session);
        refreshBatch();
        break;
      }
    }
    emit();
  }

  return { state, dispatch };
}
