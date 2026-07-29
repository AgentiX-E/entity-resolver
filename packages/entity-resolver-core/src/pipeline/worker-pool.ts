/**
 * Worker Pool — Abstract interface + single-threaded reference implementation.
 *
 * Defines the contract for parallel task execution. The browser package
 * provides a real Web Worker implementation; this module provides a
 * single-threaded fallback for environments without Worker API.
 *
 * Design principle: core defines the contract, platform packages implement.
 *
 * Reference:
 *   - Transferable objects: https://developer.mozilla.org/en-US/docs/Glossary/Transferable_objects
 *   - Atomics.waitAsync: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/waitAsync
 */

export interface WorkerTask<T = unknown> {
  /** Unique task identifier. */
  readonly id: number;
  /** Task payload — must be serializable (structured clone or Transferable). */
  readonly payload: unknown;
  /** Current status. */
  status: 'pending' | 'running' | 'done' | 'error';
  /** Result (populated on completion). */
  result?: T;
  /** Error message (populated on error). */
  error?: string;
}

export interface WorkerPoolConfig {
  /** Maximum concurrent workers. Default: hardwareConcurrency - 1 (leave 1 for UI). */
  readonly maxWorkers?: number;
  /** Worker script URL or path. */
  readonly workerScript?: string;
  /** Time-to-idle before terminating workers (ms). Default: 30000. */
  readonly idleTimeoutMs?: number;
}

export type TaskProcessor<T = unknown> = (payload: unknown) => Promise<T>;

/**
 * Abstract worker pool interface. Platform packages (browser, node) implement
 * this with real threading. Core provides a single-threaded fallback that uses
 * Promise.all — correct but not parallel.
 */
export interface IWorkerPool {
  /** Submit a batch of tasks for parallel execution. */
  executeAll<T = unknown>(
    tasks: Array<{ id: number; payload: unknown }>,
    processor: TaskProcessor<T>,
  ): Promise<Map<number, T>>;

  /** Number of active workers. */
  readonly activeWorkers: number;

  /** Maximum concurrent workers. */
  readonly maxWorkers: number;

  /** Shut down all workers. */
  terminate(): void;
}

// ─── Single-threaded reference implementation ────────────────────

export class SingleThreadPool implements IWorkerPool {
  readonly maxWorkers: number;
  private _active = 0;

  constructor(config: WorkerPoolConfig = {}) {
    this.maxWorkers = config.maxWorkers ?? 1;
  }

  get activeWorkers(): number {
    return this._active;
  }

  async executeAll<T>(
    tasks: Array<{ id: number; payload: unknown }>,
    processor: TaskProcessor<T>,
  ): Promise<Map<number, T>> {
    this._active++;
    try {
      const results = new Map<number, T>();
      // Process in concurrency-limited batches
      const batchSize = Math.min(this.maxWorkers, tasks.length);
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((t) => processor(t.payload).then((r) => ({ id: t.id, result: r }))),
        );
        for (const { id, result } of batchResults) {
          results.set(id, result);
        }
      }
      return results;
    } finally {
      this._active--;
    }
  }

  terminate(): void {
    // No-op: no actual workers to terminate
  }
}
