import { describe, it, expect } from 'vitest';
import {
  inheritSlots,
  buildExtractionContext,
  detectModification,
  detectCancellation,
  detectCorrection,
} from '../slot-inheritance.js';

describe('detectCancellation', () => {
  it('detects Chinese cancellation', () => {
    expect(detectCancellation('取消')).toBe(true);
    expect(detectCancellation('算了')).toBe(true);
    expect(detectCancellation('不要了')).toBe(true);
    expect(detectCancellation('撤回')).toBe(true);
  });

  it('detects English cancellation', () => {
    expect(detectCancellation('cancel')).toBe(true);
    expect(detectCancellation('forget it')).toBe(true);
  });

  it('does not flag normal text', () => {
    expect(detectCancellation('明天开会')).toBe(false);
    expect(detectCancellation('set alarm')).toBe(false);
  });
});

describe('detectModification', () => {
  const prevCtx = buildExtractionContext(
    { time: '15:00:00', date: '2024-06-16', title: 'Meeting' },
    { time: 0.9, date: 0.9, title: 0.85 },
    { time: 'pattern', date: 'pattern', title: 'pattern' },
  );

  it('detects Chinese change keyword', () => {
    const result = detectModification('改成5点', prevCtx);
    expect(result.isModification).toBe(true);
  });

  it('detects English change keyword', () => {
    const result = detectModification('change to 5pm', prevCtx);
    expect(result.isModification).toBe(true);
  });

  it('detects changed field from synonyms', () => {
    const result = detectModification('改成下午5点', prevCtx);
    expect(result.isModification).toBe(true);
    expect(result.changedField).toBe('time');
  });

  it('returns false when no previous context', () => {
    const result = detectModification('改成5点');
    expect(result.isModification).toBe(false);
  });

  it('returns false for normal text without change keyword', () => {
    const result = detectModification('明天开会', prevCtx);
    expect(result.isModification).toBe(false);
  });
});

describe('detectCorrection', () => {
  it('detects Chinese correction', () => {
    expect(detectCorrection('不是3点')).toBe(true);
    expect(detectCorrection('错了')).toBe(true);
  });

  it('detects English correction', () => {
    expect(detectCorrection('no, 5pm')).toBe(true);
    expect(detectCorrection('wrong time')).toBe(true);
  });
});

describe('inheritSlots', () => {
  const prevCtx = buildExtractionContext(
    { time: '15:00:00', date: '2024-06-16', title: 'Meeting', location: 'Room 201' },
    { time: 0.95, date: 0.95, title: 0.85, location: 0.8 },
    { time: 'pattern', date: 'pattern', title: 'pattern', location: 'pattern' },
  );

  it('inherits unchanged slots from previous context', () => {
    const result = inheritSlots(
      {}, // no new values
      {},
      prevCtx,
      '改成5点',
    );

    expect(result.values.time).toBe('15:00:00');
    expect(result.values.date).toBe('2024-06-16');
    expect(result.values.title).toBe('Meeting');
    expect(result.canceled).toBe(false);
  });

  it('overrides modified slot with new value', () => {
    const result = inheritSlots({ time: '17:00:00' }, { time: 0.9 }, prevCtx, '改成5点');

    expect(result.values.time).toBe('17:00:00');
    expect(result.modifiedFields).toContain('time');
  });

  it('preserves other slots during modification', () => {
    const result = inheritSlots({ time: '17:00:00' }, { time: 0.9 }, prevCtx, '改成5点');

    expect(result.values.date).toBe('2024-06-16');
    expect(result.values.title).toBe('Meeting');
    expect(result.values.location).toBe('Room 201');
  });

  it('returns canceled state for cancellation text', () => {
    const result = inheritSlots({}, {}, prevCtx, '取消');

    expect(result.canceled).toBe(true);
    expect(result.values._canceled).toBe(true);
  });

  it('adds new fields not in previous context', () => {
    const result = inheritSlots(
      { description: 'Bring laptop' },
      { description: 0.85 },
      prevCtx,
      '记得带电脑',
    );

    expect(result.values.description).toBe('Bring laptop');
    // Existing slots preserved
    expect(result.values.time).toBe('15:00:00');
  });

  it('tracks inherited fields', () => {
    const result = inheritSlots({ time: '17:00:00' }, { time: 0.9 }, prevCtx, '改成5点');

    expect(result.inheritedFields).toContain('date');
    expect(result.inheritedFields).toContain('title');
    expect(result.inheritedFields).toContain('location');
  });

  it('does not inherit when confidence significantly lower', () => {
    const result = inheritSlots(
      { time: '09:00:00' },
      { time: 0.4 }, // much lower confidence
      prevCtx,
      'maybe 9am?',
    );

    // Should keep the inherited value since new confidence is much lower
    expect(result.values.time).toBe('15:00:00');
  });

  it('handles empty previous context gracefully', () => {
    const emptyCtx = buildExtractionContext({}, {}, {});
    const result = inheritSlots({ title: 'New meeting' }, { title: 0.85 }, emptyCtx, 'new meeting');
    expect(result.values.title).toBe('New meeting');
  });
});

describe('buildExtractionContext', () => {
  it('creates context from extraction components', () => {
    const ctx = buildExtractionContext(
      { name: 'John' },
      { name: 0.95 },
      { name: 'pattern' },
      'search',
      'find John',
    );
    expect(ctx.values.name).toBe('John');
    expect(ctx.intentName).toBe('search');
    expect(ctx.normalizedText).toBe('find John');
  });
});
