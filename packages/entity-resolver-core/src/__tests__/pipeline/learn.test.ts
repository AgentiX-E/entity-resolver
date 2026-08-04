import { describe, it, expect } from 'vitest';
import { createStudentMatcher } from '../../pipeline/learn.js';
import type { MatchingSOP } from '../../pipeline/unified.js';

const sop: MatchingSOP = {
  version: '1.0', domain: 'test',
  fieldHierarchy: {
    critical: ['email'], high: ['name'], medium: ['city'], low: ['zip'],
  },
  tolerances: { email: [], name: ['typo'], city: [], zip: [] },
  decisionRules: {
    match: '>=1 critical agree',
    review: '1 conflict',
    nonMatch: '>=1 critical conflict',
  },
  estimatedDensity: 0.01,
};

describe('createStudentMatcher', () => {
  it('returns trained student with correct name and cost', () => {
    const s = createStudentMatcher(sop);
    expect(s.name).toBe('sop_student');
    expect(s.trained).toBe(true);
    expect(s.costPerMillion).toBe(12);
  });

  it('scores perfect match as 1.0', async () => {
    const s = createStudentMatcher(sop);
    const scores = await s.predictability([
      { leftId: 0, rightId: 1, score: 1, probability: 1, fieldScores: { email: 1.0, name: 1.0, city: 1.0 } },
    ]);
    expect(scores[0]).toBe(1);
  });

  it('scores complete non-match as 0', async () => {
    const s = createStudentMatcher(sop);
    const scores = await s.predictability([
      { leftId: 0, rightId: 1, score: 0, probability: 0, fieldScores: { email: 0, name: 0, city: 0 } },
    ]);
    expect(scores[0]).toBe(0);
  });

  it('weights critical field higher than high field', async () => {
    const s = createStudentMatcher(sop);
    const cr = await s.predictability([
      { leftId: 0, rightId: 1, score: 0.5, probability: 0.5, fieldScores: { email: 1.0, name: 0, city: 0 } },
    ]);
    const hi = await s.predictability([
      { leftId: 0, rightId: 1, score: 0.5, probability: 0.5, fieldScores: { email: 0, name: 1.0, city: 0 } },
    ]);
    expect(cr[0]).toBeGreaterThan(hi[0]!);
  });

  it('handles moderate field scores correctly', async () => {
    const s = createStudentMatcher(sop);
    const scores = await s.predictability([
      { leftId: 0, rightId: 1, score: 0.5, probability: 0.5, fieldScores: { email: 0.6, name: 0.9 } },
    ]);
    expect(scores[0]).toBeGreaterThan(0);
    expect(scores[0]).toBeLessThan(1);
  });
});
