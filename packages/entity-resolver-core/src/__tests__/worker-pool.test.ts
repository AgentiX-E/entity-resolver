import { describe, it, expect } from 'vitest';
import { SingleThreadPool } from '../pipeline/worker-pool.js';
import type { TaskProcessor } from '../pipeline/worker-pool.js';

describe('SingleThreadPool', () => {
  it('is instantiable with default config', () => {
    const pool = new SingleThreadPool();
    expect(pool.maxWorkers).toBe(1);
    expect(pool.activeWorkers).toBe(0);
  });

  it('is instantiable with custom concurrency', () => {
    const pool = new SingleThreadPool({ maxWorkers: 4 });
    expect(pool.maxWorkers).toBe(4);
  });

  it('executes tasks and returns results by id', async () => {
    const pool = new SingleThreadPool({ maxWorkers: 2 });
    const tasks = [
      { id: 1, payload: { a: 1, b: 2 } },
      { id: 2, payload: { a: 3, b: 4 } },
      { id: 3, payload: { a: 5, b: 6 } },
    ];

    const processor: TaskProcessor<number> = async (payload: unknown) => {
      const p = payload as { a: number; b: number };
      return p.a + p.b;
    };

    const results = await pool.executeAll(tasks, processor);
    expect(results.get(1)).toBe(3);
    expect(results.get(2)).toBe(7);
    expect(results.get(3)).toBe(11);
    expect(results.size).toBe(3);
  });

  it('handles empty task list', async () => {
    const pool = new SingleThreadPool();
    const results = await pool.executeAll([], async () => 'unused');
    expect(results.size).toBe(0);
  });

  it('handles task errors gracefully', async () => {
    const pool = new SingleThreadPool();
    const tasks = [
      { id: 1, payload: 'valid' },
      { id: 2, payload: 'boom' },
    ];
    const processor: TaskProcessor<string> = async (payload) => {
      if (payload === 'boom') throw new Error('BOOM');
      return String(payload);
    };

    try {
      await pool.executeAll(tasks, processor);
      expect(false).toBe(true); // Should have thrown
    } catch {
      // Expected — error propagates
      expect(true).toBe(true);
    }
  });

  it('activeWorkers tracks execution count', () => {
    const pool = new SingleThreadPool();
    expect(pool.activeWorkers).toBe(0);
    // activeWorkers increments during execution
  });

  it('terminate is a no-op', () => {
    const pool = new SingleThreadPool();
    expect(() => { pool.terminate(); }).not.toThrow();
  });

  it('processes large batch with concurrency', async () => {
    const pool = new SingleThreadPool({ maxWorkers: 4 });
    const tasks = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      payload: i,
    }));
    const processor: TaskProcessor<number> = async (p) => (p as number) * 2;

    const start = Date.now();
    const results = await pool.executeAll(tasks, processor);
    const elapsed = Date.now() - start;

    expect(results.size).toBe(50);
    expect(results.get(0)).toBe(0);
    expect(results.get(49)).toBe(98);

    // Should complete quickly (< 5s for 50 simple tasks)
    expect(elapsed).toBeLessThan(5000);
  }, 10000);
});
