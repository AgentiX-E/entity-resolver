import { MemoryEntityStore } from '@agentix-e/entity-resolution-core';

export interface ResolvedStorage {
  readonly backend: 'embed' | 'remote' | 'memory';
  readonly store: MemoryEntityStore;
}

export async function resolveStorage(options?: {
  backend?: 'embed' | 'remote' | 'memory';
}): Promise<ResolvedStorage> {
  const backend = options?.backend ?? 'memory';
  return { backend, store: new MemoryEntityStore() };
}
