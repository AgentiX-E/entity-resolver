/**
 * Browser Worker Pool — Real Web Worker multi-threading.
 *
 * Creates a pool of Web Workers to score record pairs in parallel.
 * Each worker runs a self-contained scoring script (bigram cosine
 * similarity, no imports needed) avoiding module dependency issues
 * in Worker contexts.
 *
 * For <50 tasks, falls back to single-threaded to avoid Worker
 * creation overhead. For >=50 tasks, distributes across workers.
 */
import type { IWorkerPool, WorkerPoolConfig, TaskProcessor } from '@agentix-e/entity-resolver-core';

export class BrowserWorkerPool implements IWorkerPool {
  readonly maxWorkers: number;
  private _workers: Worker[] = [];
  private _activeWorkers = 0;
  private _idleTimer: number | null = null;

  constructor(config: WorkerPoolConfig = {}) {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
    this.maxWorkers = config.maxWorkers ?? Math.max(1, hw - 1);
  }

  get activeWorkers(): number {
    return this._activeWorkers;
  }

  async executeAll<T>(
    tasks: Array<{ id: number; payload: unknown }>,
    processor: TaskProcessor<T>,
  ): Promise<Map<number, T>> {
    this._activeWorkers++;
    this._clearIdle();

    try {
      // Small batches: single-threaded to avoid Worker overhead
      if (tasks.length < 50) {
        const results = new Map<number, T>();
        const processed = await Promise.all(
          tasks.map((t) => processor(t.payload).then((r) => ({ id: t.id, result: r }))),
        );
        for (const { id, result } of processed) results.set(id, result);
        return results;
      }

      // Large batches: distribute across workers
      const results = new Map<number, T>();
      const chunkSize = Math.ceil(tasks.length / this.maxWorkers);

      for (let i = 0; i < tasks.length; i += chunkSize * this.maxWorkers) {
        const batch = tasks.slice(i, i + chunkSize * this.maxWorkers);
        const workerTasks = this._splitChunks(batch, this.maxWorkers);

        const promises = workerTasks.map((b, idx) => this._runOnWorker(idx, b));
        const batchResults = await Promise.all(promises);
        for (const wr of batchResults) {
          for (const r of wr) results.set(r.id, r.result as T);
        }
      }

      this._startIdle();
      return results;
    } finally {
      this._activeWorkers--;
    }
  }

  private async _runOnWorker(
    slotIndex: number,
    tasks: Array<{ id: number; payload: unknown }>,
  ): Promise<Array<{ id: number; result: unknown }>> {
    while (this._workers.length <= slotIndex) {
      this._workers.push(this._createWorker());
    }

    const worker = this._workers[slotIndex]!;
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        worker.removeEventListener('message', handler);
        if (e.data?.error) reject(new Error(e.data.error));
        else resolve(e.data?.results ?? []);
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'scorePairs',
        tasks: tasks.map((t) => ({ id: t.id, payload: t.payload })),
      });
      setTimeout(() => {
        worker.removeEventListener('message', handler);
        reject(new Error('Worker timeout'));
      }, 60_000);
    });
  }

  private _createWorker(): Worker {
    const code = SELF_CONTAINED_WORKER_SCRIPT;
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  }

  private _splitChunks<T>(arr: T[], count: number): T[][] {
    const chunks: T[][] = [];
    const size = Math.ceil(arr.length / count);
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private _startIdle(): void {
    this._idleTimer = setTimeout(() => {
      for (const w of this._workers) w.terminate();
      this._workers = [];
    }, 30_000) as unknown as number;
  }

  private _clearIdle(): void {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  terminate(): void {
    for (const w of this._workers) w.terminate();
    this._workers = [];
    this._activeWorkers = 0;
    this._clearIdle();
  }
}

// Self-contained scoring script — no imports to avoid module resolution
// issues in Worker contexts across different bundlers (webpack, esbuild, etc.)
const SELF_CONTAINED_WORKER_SCRIPT = `"use strict";
self.onmessage=function(e){try{var t=e.data.tasks,r=[];for(var i=0;i<t.length;i++){var n=t[i],o=n.payload,p=o.left,q=o.right,s={};for(var k in p){if(!(k in q))continue;var a=p[k],b=q[k];if(typeof a=="string"&&typeof b=="string"){var bg=function(str){for(var r=[],i=0;i<str.length-1;i++)r.push(str.slice(i,i+2));return r},ba=bg(a.toLowerCase()),bb=bg(b.toLowerCase()),it=ba.filter(function(x){return bb.indexOf(x)>=0}).length,u=new Set(ba.concat(bb)).size;s[k]=u>0?it/u:0}else s[k]=a===b?1:0}var vals=Object.values(s),avg=vals.length>0?vals.reduce(function(a,b){return a+b},0)/vals.length:.5;r.push({id:n.id,result:{score:avg,scores:s}})}self.postMessage({results:r})}catch(er){self.postMessage({error:er.message||String(er)})}};
`;
