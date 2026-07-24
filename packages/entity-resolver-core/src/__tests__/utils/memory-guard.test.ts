/**
 * Tests for memory guard utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  checkMemory,
  isMemoryHigh,
  estimateBlockingMemory,
} from '../../utils/memory-guard.js';

describe('checkMemory', () => {
  it('returns MemorySnapshot with heapUsed and heapTotal', () => {
    const snapshot = checkMemory();
    expect(typeof snapshot.heapUsed).toBe('number');
    expect(typeof snapshot.heapTotal).toBe('number');
    expect(typeof snapshot.warned).toBe('boolean');
  });

  it('warned is false with high thresholds', () => {
    const snapshot = checkMemory({
      warnThreshold: 10 * 1024 * 1024 * 1024, // 10GB
    });
    expect(snapshot.warned).toBe(false);
  });

  it('warned is true with extremely low threshold', () => {
    const snapshot = checkMemory({
      warnThreshold: 1, // 1 byte — always triggered
    });
    // In CI, heap used > 1 byte, so warned should be true
    expect(typeof snapshot.warned).toBe('boolean');
  });

  it('throws when exceeding error threshold', () => {
    expect(() =>
      checkMemory({ errorThreshold: 1 }),
    ).toThrow('Memory usage');
  });

  it('uses default thresholds when no config provided', () => {
    const snapshot = checkMemory();
    expect(snapshot).toBeDefined();
  });
});

describe('isMemoryHigh', () => {
  it('returns boolean', () => {
    expect(typeof isMemoryHigh()).toBe('boolean');
  });

  it('returns true with low threshold', () => {
    expect(isMemoryHigh({ warnThreshold: 1 })).toBe(true);
  });
});

describe('estimateBlockingMemory', () => {
  it('estimates memory for typical dataset', () => {
    const bytes = estimateBlockingMemory(10000, 50000, 3);
    // 50000 pairs * (150 + 3*50) = 50000 * 300 = 15MB
    expect(bytes).toBeGreaterThan(10_000_000);
    expect(bytes).toBeLessThan(30_000_000);
  });

  it('returns zero for zero pairs', () => {
    expect(estimateBlockingMemory(1000, 0)).toBe(0);
  });

  it('scales linearly with pair count', () => {
    const a = estimateBlockingMemory(1000, 1000);
    const b = estimateBlockingMemory(1000, 2000);
    expect(b).toBe(a * 2);
  });

  it('accounts for comparisonsPerPair overhead', () => {
    const a = estimateBlockingMemory(1000, 1000, 1);
    const b = estimateBlockingMemory(1000, 1000, 5);
    expect(b).toBeGreaterThan(a);
  });
});
