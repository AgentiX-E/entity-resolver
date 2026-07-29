import { describe, it, expect } from 'vitest';
import { resolveIntent, registerIntent, lookupIntent } from '../intent-context.js';
import type { IntentDefinition } from '../intent-context.js';

describe('resolveIntent', () => {
  it('resolves alarm intent by name', () => {
    const result = resolveIntent('alarm');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('alarm');
  });

  it('resolves alarm intent by Chinese synonym', () => {
    const result = resolveIntent('闹钟');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('alarm');
  });

  it('resolves reminder intent', () => {
    const result = resolveIntent('reminder');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('reminder');
    expect(result!.requiredFields).toContain('title');
  });

  it('resolves schedule intent', () => {
    const result = resolveIntent('meeting');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('schedule');
  });

  it('resolves message intent', () => {
    const result = resolveIntent('send');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('message');
  });

  it('resolves search intent', () => {
    const result = resolveIntent('search');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('search');
  });

  it('alarm intent has required time field', () => {
    const result = resolveIntent('alarm');
    expect(result!.requiredFields).toContain('time');
  });

  it('alarm intent boosts time field', () => {
    const result = resolveIntent('alarm');
    expect(result!.boosts.time).toBeGreaterThan(0);
  });

  it('alarm intent has default title', () => {
    const result = resolveIntent('alarm');
    expect(result!.defaults.title).toBe('Alarm');
  });

  it('returns undefined for unknown intent', () => {
    const result = resolveIntent('nonexistent_intent');
    expect(result).toBeUndefined();
  });

  it('resolves intent from text content', () => {
    const result = resolveIntent(undefined, '设个明天3点的闹钟');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('alarm');
  });

  it('returns prioritised fields sorted by intent importance', () => {
    const result = resolveIntent('alarm');
    expect(result!.prioritizedFields.length).toBeGreaterThan(0);
    // time should be first (most important for alarm)
    expect(result!.prioritizedFields[0]!.name).toBe('time');
  });
});

describe('registerIntent', () => {
  it('registers and retrieves a custom intent', () => {
    const custom: IntentDefinition = {
      name: 'weather',
      synonyms: ['weather', '天气', '天気'],
      fields: [
        { name: 'city', type: 'string', boost: 0.15, required: true },
        { name: 'date', type: 'date', boost: 0.05 },
      ],
      defaults: { date: 'today' },
    };
    registerIntent(custom);
    const result = resolveIntent('天气');
    expect(result).toBeDefined();
    expect(result!.intentName).toBe('weather');
    expect(result!.requiredFields).toContain('city');
  });
});

describe('lookupIntent', () => {
  it('looks up by exact name', () => {
    const def = lookupIntent('alarm');
    expect(def).toBeDefined();
    expect(def!.name).toBe('alarm');
  });

  it('looks up by synonym', () => {
    const def = lookupIntent('闹钟');
    expect(def).toBeDefined();
    expect(def!.name).toBe('alarm');
  });

  it('lookup is case-insensitive', () => {
    const def = lookupIntent('ALARM');
    expect(def).toBeDefined();
    expect(def!.name).toBe('alarm');
  });

  it('returns undefined for unknown intent', () => {
    const def = lookupIntent('xyz');
    expect(def).toBeUndefined();
  });
});
