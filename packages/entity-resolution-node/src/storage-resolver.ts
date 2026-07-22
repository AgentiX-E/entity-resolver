import { MemoryEntityStore } from '@agentix-e/entity-resolution-core';

export interface ResolvedStorage {
  readonly backend: 'duckdb' | 'postgres' | 'memory';
  readonly store: Record<string, unknown> & {
    getEntity: (id: string) => Promise<unknown>;
    queryNeighbors: (id: string, hops?: number) => Promise<unknown[]>;
    upsertEntity: (e: unknown) => Promise<void>;
    deleteEntity: (id: string) => Promise<void>;
    applyMerge: (from: string, into: string) => Promise<void>;
    applySplit: (entityId: string, groups: string[][]) => Promise<void>;
    close?: () => Promise<void>;
  };
}

export async function resolveStorage(options?: {
  backend?: 'duckdb' | 'postgres' | 'memory';
  duckdbPath?: string;
  pgConfig?: Record<string, unknown>;
}): Promise<ResolvedStorage> {
  const backend = options?.backend ?? 'memory';

  if (backend === 'duckdb') {
    try {
      const { DuckDBStore } = await import('./storage/duckdb-store.js');
      const cfg: any = {}; if (options?.duckdbPath) cfg.path = options.duckdbPath; const store = await DuckDBStore.create(cfg);
      return { backend: 'duckdb', store: store as any };
    } catch {
      return { backend: 'memory', store: new MemoryEntityStore() as any };
    }
  }

  if (backend === 'postgres') {
    try {
      const { PgEntityStore } = await import('./storage/pg-store.js');
      const store = await PgEntityStore.create(options?.pgConfig as any);
      return { backend: 'postgres', store: store as any };
    } catch {
      return { backend: 'memory', store: new MemoryEntityStore() as any };
    }
  }

  return { backend: 'memory', store: new MemoryEntityStore() as any };
}
