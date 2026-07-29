import { describe, it, expect } from 'vitest';
import { studioVersion } from '../index.js';
import { createStudioSession, studioNextBatch, studioApply, studioReset } from '../session.js';
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
