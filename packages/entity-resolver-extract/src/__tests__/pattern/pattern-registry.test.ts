import { describe, it, expect } from 'vitest';
import { PatternRegistry } from '../../pattern/pattern-registry.js';
import { registerBuiltins, builtinMatchers } from '../../pattern/builtin-patterns.js';
import type { PatternMatcher } from '../../pattern/pattern-registry.js';

describe('PatternRegistry', () => {
  it('creates an empty registry', () => {
    const registry = new PatternRegistry();
    expect(registry.size).toBe(0);
    expect(registry.getRegisteredTypes()).toEqual([]);
  });

  it('registers a custom matcher', () => {
    const registry = new PatternRegistry();
    const matcher: PatternMatcher = {
      name: 'test',
      extract: (text: string) => {
        const match = /hello/.exec(text);
        if (match)
          return [{ value: 'hello', confidence: 1.0, matchedText: match[0], offset: match.index }];
        return [];
      },
    };
    registry.register('greeting', matcher, 5);
    expect(registry.size).toBe(1);
    expect(registry.has('greeting')).toBe(true);
    expect(registry.get('greeting')).toBe(matcher);
  });

  it('does not overwrite with lower or equal priority', () => {
    const registry = new PatternRegistry();
    const first: PatternMatcher = {
      name: 'first',
      extract: () => [{ value: 'a', confidence: 1.0, matchedText: 'a', offset: 0 }],
    };
    const second: PatternMatcher = {
      name: 'second',
      extract: () => [{ value: 'b', confidence: 1.0, matchedText: 'b', offset: 0 }],
    };
    registry.register('f', first, 10);
    registry.register('f', second, 5); // lower priority — should be ignored
    expect(registry.get('f')).toBe(first);
  });

  it('overwrites with higher priority', () => {
    const registry = new PatternRegistry();
    const first: PatternMatcher = {
      name: 'first',
      extract: () => [{ value: 'a', confidence: 1.0, matchedText: 'a', offset: 0 }],
    };
    const second: PatternMatcher = {
      name: 'second',
      extract: () => [{ value: 'b', confidence: 1.0, matchedText: 'b', offset: 0 }],
    };
    registry.register('f', first, 5);
    registry.register('f', second, 10); // higher priority — should replace
    expect(registry.get('f')).toBe(second);
  });

  it('extracts the best match by confidence', () => {
    const registry = new PatternRegistry();
    const matcher: PatternMatcher = {
      name: 'multi',
      extract: () => [
        { value: 'low', confidence: 0.5, matchedText: 'low', offset: 0 },
        { value: 'high', confidence: 0.99, matchedText: 'high', offset: 5 },
        { value: 'mid', confidence: 0.75, matchedText: 'mid', offset: 10 },
      ],
    };
    registry.register('x', matcher);
    const result = registry.extract('x', 'whatever');
    expect(result).not.toBeNull();
    expect(result!.value).toBe('high');
  });

  it('returns null for unregistered type', () => {
    const registry = new PatternRegistry();
    expect(registry.extract('unknown', 'text')).toBeNull();
  });

  it('extractAll returns all registered type matches', () => {
    const registry = new PatternRegistry();
    registry.register('a', {
      name: 'a',
      extract: () => [{ value: 1, confidence: 0.9, matchedText: 'one', offset: 0 }],
    });
    registry.register('b', {
      name: 'b',
      extract: () => [{ value: 2, confidence: 0.8, matchedText: 'two', offset: 5 }],
    });
    const results = registry.extractAll('one two');
    expect(results.size).toBe(2);
    expect(results.get('a')!.value).toBe(1);
    expect(results.get('b')!.value).toBe(2);
  });

  it('clear removes all matchers', () => {
    const registry = new PatternRegistry();
    registerBuiltins(registry);
    expect(registry.size).toBeGreaterThan(0);
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

describe('builtinMatchers', () => {
  it('contains all 8 field types', () => {
    const types = Object.keys(builtinMatchers);
    expect(types).toContain('email');
    expect(types).toContain('phone');
    expect(types).toContain('url');
    expect(types).toContain('number');
    expect(types).toContain('integer');
    expect(types).toContain('boolean');
    expect(types).toContain('date');
    expect(types).toContain('time');
  });

  it('registerBuiltins populates an empty registry', () => {
    const registry = new PatternRegistry();
    registerBuiltins(registry);
    expect(registry.size).toBe(8);
  });
});
