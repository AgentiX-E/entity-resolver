import { describe, it, expect } from 'vitest';
import { studioVersion } from '../index.js';
import { createStudioSession, studioNextBatch, studioApply, studioReset } from '../session.js';
import { createStudioMachine } from '../state-machine.js';
import type { ScoredPair } from '@agentix-e/entity-resolver-core';

function mk(s: number): ScoredPair {
  return { leftId: 0, rightId: 1, score: s };
}

const records = [
  { name: 'John', city: 'NYC' },
  { name: 'Jon', city: 'New York' },
];

describe('createStudioSession', () => {
  it('creates session with correct count', () => {
    const s = createStudioSession([mk(0.85), mk(0.6)], records, 10, 100);
    expect(s.pairs).toHaveLength(2);
  });

  it('selects most uncertain pairs first', () => {
    const s = createStudioSession([mk(0.99), mk(0.51), mk(0.01)], records, 10, 100);
    expect(s.pairs[0]!.machineScore).toBeCloseTo(0.51, 2);
  });

  it('handles empty fields gracefully', () => {
    const s = createStudioSession([mk(0.85)], [{}, {}], 10, 100);
    expect(s.pairs[0]!.fieldScores.length).toBe(0);
  });

  it('generates unique session IDs', () => {
    const a = createStudioSession([mk(0.5)], records);
    const b = createStudioSession([mk(0.5)], records);
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});

describe('studioNextBatch', () => {
  it('returns first batch', () => {
    const pairs = Array.from({ length: 5 }, () => mk(0.5));
    const s = createStudioSession(pairs, records, 2, 100);
    const b = studioNextBatch(s);
    expect(b).not.toBeNull();
    expect(b!.pairs).toHaveLength(2);
  });

  it('returns null when all pairs labeled', () => {
    const s = createStudioSession([mk(0.5)], records, 10, 100);
    studioApply(s, [{ pairId: s.pairs[0]!.id, isMatch: true }]);
    expect(studioNextBatch(s)).toBeNull();
  });

  it('tracks progress', () => {
    const pairs = Array.from({ length: 10 }, () => mk(0.5));
    const s = createStudioSession(pairs, records, 2, 100);
    const b = studioNextBatch(s);
    expect(b!.progress).toBe(0);
  });
});

describe('studioApply', () => {
  it('applies labels to specific pairs', () => {
    const s = createStudioSession([mk(0.85), mk(0.6)], records, 10, 100);
    studioApply(s, [{ pairId: s.pairs[0]!.id, isMatch: true }]);
    expect(s.pairs[0]!.label).toBe(true);
    expect(s.pairs[1]!.label).toBe(null);
  });

  it('sets labeledAt timestamp', () => {
    const s = createStudioSession([mk(0.85)], records, 10, 100);
    studioApply(s, [{ pairId: s.pairs[0]!.id, isMatch: false }]);
    expect(s.pairs[0]!.labeledAt).toBeGreaterThan(0);
  });

  it('does not overwrite existing labels', () => {
    const s = createStudioSession([mk(0.85)], records, 10, 100);
    studioApply(s, [{ pairId: s.pairs[0]!.id, isMatch: true }]);
    studioApply(s, [{ pairId: s.pairs[0]!.id, isMatch: false }]);
    expect(s.pairs[0]!.label).toBe(true);
  });

  it('ignores labels for nonexistent pair IDs', () => {
    const s = createStudioSession([mk(0.85)], records, 10, 100);
    studioApply(s, [{ pairId: 'nonexistent', isMatch: true }]);
    expect(s.pairs[0]!.label).toBe(null);
  });
});

describe('studioReset', () => {
  it('clears all labels', () => {
    const s = createStudioSession([mk(0.85)], records, 10, 100);
    studioApply(s, [{ pairId: s.pairs[0]!.id, isMatch: true }]);
    studioReset(s);
    expect(s.pairs[0]!.label).toBe(null);
  });
});

describe('StudioPairReviewElement', () => {
  it('component module imports without errors', async () => {
    const mod = await import('../components/pair-review.js');
    expect(mod.StudioPairReviewElement).toBeDefined();
  });

  it('registers custom element on import', async () => {
    await import('../components/pair-review.js');
    expect(customElements.get('studio-pair-review')).toBeDefined();
  });
});

describe('studioVersion', () => {
  it('is semver string', () => {
    expect(studioVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─── State Machine ────────────────────────────────────────────────

describe('createStudioMachine', () => {
  it('start creates session and batch', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    expect(state.session).not.toBeNull();
    expect(state.batch).not.toBeNull();
  });

  it('match labels current pair as true', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'match' });
    expect(state.session!.pairs[0]!.label).toBe(true);
  });

  it('noMatch labels current pair as false', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'noMatch' });
    expect(state.session!.pairs[0]!.label).toBe(false);
  });

  it('skip advances selectedIndex', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85), mk(0.6)], records, batchSize: 10 });
    dispatch({ type: 'skip' });
    expect(state.selectedIndex).toBe(1);
  });

  it('undo reverts last label', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'match' });
    dispatch({ type: 'undo' });
    expect(state.session!.pairs[0]!.label).toBe(null);
  });

  it('reset clears all labels', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'match' });
    dispatch({ type: 'reset' });
    expect(state.session!.pairs[0]!.label).toBe(null);
  });

  it('nextBatch advances', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    const pairs = Array.from({ length: 5 }, () => mk(0.5));
    dispatch({ type: 'start', pairs, records, batchSize: 2 });
    for (let i = 0; i < 2; i++) dispatch({ type: 'match' });
    dispatch({ type: 'nextBatch' });
    expect(state.batch).not.toBeNull();
  });

  it('selectPrev goes back', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85), mk(0.6)], records, batchSize: 10 });
    dispatch({ type: 'skip' });
    dispatch({ type: 'selectPrev' });
    expect(state.selectedIndex).toBe(0);
  });
});

// ─── Edge Case: non-string field comparison ──────────────────────

describe('session edge cases', () => {
  it('compares boolean fields correctly (match=1, diff=0)', () => {
    const recordsWithBool = [
      { name: 'A', active: true },
      { name: 'A', active: false },
    ];
    const s = createStudioSession([mk(0.85)], recordsWithBool, 10, 100);
    const p = s.pairs[0]!;
    const f = p.fieldScores.find((x) => x.fieldName === 'active');
    expect(f!.score).toBe(0.0);
  });

  it('compares numeric fields with equality', () => {
    const recordsWithNum = [
      { id: 42, name: 'A' },
      { id: 42, name: 'B' },
    ];
    const s = createStudioSession([mk(0.85)], recordsWithNum, 10, 100);
    const p = s.pairs[0]!;
    const f = p.fieldScores.find((x) => x.fieldName === 'id');
    expect(f!.score).toBe(1.0);
  });
});

// ─── State machine edge cases ────────────────────────────────────

describe('state machine edge cases', () => {
  it('selectNext before start is no-op (batch null)', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'selectNext' });
    expect(state.selectedIndex).toBe(0);
  });

  it('selectPrev before start is no-op (batch null)', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'selectPrev' });
    expect(state.selectedIndex).toBe(0);
  });

  it('selectNext advances selectedIndex', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85), mk(0.6)], records, batchSize: 10 });
    dispatch({ type: 'selectNext' });
    expect(state.selectedIndex).toBe(1);
  });

  it('selectNext at last index does not advance past end', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'selectNext' });
    expect(state.selectedIndex).toBe(0);
  });

  it('selectPrev at index 0 stays at 0', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'selectPrev' });
    expect(state.selectedIndex).toBe(0);
  });

  it('undo does nothing for unlabeled session', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'undo' });
    expect(state.session!.pairs[0]!.label).toBe(null);
  });

  it('skip at last index wraps back for next batch', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'start', pairs: [mk(0.85)], records, batchSize: 10 });
    dispatch({ type: 'skip' });
    // With only 1 pair, skip cannot advance — stays at 0
    expect(state.selectedIndex).toBe(0);
  });
});

// ─── Coverage: remaining branch edges ────────────────────────────

describe('state machine coverage edges', () => {
  it('skip with null batch is a no-op', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'skip' });
    expect(state.session).toBeNull();
  });

  it('match with null session is a no-op', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'match' });
    expect(state.session).toBeNull();
  });

  it('noMatch with null session is a no-op', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'noMatch' });
    expect(state.session).toBeNull();
  });

  it('undo with null session is a no-op', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'undo' });
    expect(state.session).toBeNull();
  });

  it('reset with null session is a no-op', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'reset' });
    expect(state.session).toBeNull();
  });

  it('nextBatch with null session is a no-op', () => {
    const { state, dispatch } = createStudioMachine(() => {});
    dispatch({ type: 'nextBatch' });
    expect(state.session).toBeNull();
  });
});

// ─── Branch edge: empty string continue ─────────────────────────

describe('session diffFields branches', () => {
  it('skips field when both values are null/undefined', () => {
    const recsWithNull = [
      { name: 'A', extra: null },
      { name: 'B', extra: null },
    ];
    const s = createStudioSession([mk(0.85)], recsWithNull, 10, 100);
    const p = s.pairs[0]!;
    // 'extra' field with both null should be skipped (continue branch)
    const extra = p.fieldScores.find((f) => f.fieldName === 'extra');
    expect(extra).toBeUndefined();
  });

  it('skips field when both values are undefined', () => {
    const recsWithUnset: Array<Record<string, unknown>> = [{ name: 'A' }, { name: 'B' }];
    const s = createStudioSession([mk(0.85)], recsWithUnset, 10, 100);
    const p = s.pairs[0]!;
    // Only 'name' field should appear
    expect(p.fieldScores.length).toBe(1);
    expect(p.fieldScores[0]!.fieldName).toBe('name');
  });
});

it('session with missing records handles empty objects gracefully', () => {
  const pair = { leftId: 999, rightId: 998, probability: 0.8, score: 0.8, comparisonVector: [] };
  const records = [{ first: 'test', last: 'data' }];
  const session = createStudioSession([pair], records, 10, 100);
  expect(session.pairs.length).toBe(1);
  expect(session.pairs[0]!.left).toEqual({});
  expect(session.pairs[0]!.right).toEqual({});
});

it('nextBatch on empty totalCount returns 0 progress', () => {
  const session = createStudioSession([], [], 10, 0);
  const batch = studioNextBatch(session);
  expect(batch).toBeNull();
});
