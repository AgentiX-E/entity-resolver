// Storage backend auto-detection for entity-resolution-node.
// Probes for installed storage packages and returns the best available IEntityStore.
// Default: core's MemoryEntityStore (Arrow in-memory, zero deps).

import { MemoryEntityStore } from '@agentix-e/entity-resolution-core';
import type { EntityId, EntityRecord } from '@agentix-e/entity-resolution-core';

export interface ResolvedStorage {
  readonly backend: 'embed' | 'remote' | 'memory';
  readonly store: {
    getEntity(id: EntityId): Promise<EntityRecord | null>;
    queryNeighbors(id: EntityId, hops?: number): Promise<EntityRecord[]>;
    upsertEntity(entity: EntityRecord): Promise<void>;
    deleteEntity(id: EntityId): Promise<void>;
    applyMerge(from: EntityId, into: EntityId): Promise<void>;
    applySplit(entityId: EntityId, members: EntityId[][]): Promise<void>;
    close?(): Promise<void>;
  };
}

/**
 * Auto-detect and resolve the best available storage backend.
 *
 * Resolution order:
 * 1. Explicit `backend` option in config
 * 2. Installed storage package detection
 * 3. Fallback: core's MemoryEntityStore (Arrow memory, always available)
 */
export async function resolveStorage(options?: {
  backend?: 'embed' | 'remote' | 'memory';
  embedConfig?: Record<string, unknown>;
  remoteConfig?: Record<string, unknown>;
}): Promise<ResolvedStorage> {
  const explicit = options?.backend;

  // Try explicit backend first
  if (explicit === 'embed') {
    return tryLoadEmbed(options?.embedConfig);
  }
  if (explicit === 'remote') {
    return tryLoadRemote(options?.remoteConfig);
  }
  if (explicit === 'memory') {
    return createMemoryStore();
  }

  // Auto-detect: probe for installed packages
  const embed = await tryDetectEmbed();
  if (embed) return embed;

  const remote = await tryDetectRemote();
  if (remote) return remote;

  // Fallback: memory (always available)
  return createMemoryStore();
}

async function tryLoadEmbed(config?: Record<string, unknown>): Promise<ResolvedStorage> {
  try {
    const mod = await import('@agentix-e/entity-resolution-storage-embed');
    const store = await mod.createEmbedStore(config);
    return { backend: 'embed', store };
  } catch {
    return createMemoryStore();
  }
}

async function tryLoadRemote(config?: Record<string, unknown>): Promise<ResolvedStorage> {
  try {
    const mod = await import('@agentix-e/entity-resolution-storage-remote');
    const store = await mod.createRemoteStore(config as any);
    return { backend: 'remote', store };
  } catch {
    return createMemoryStore();
  }
}

async function tryDetectEmbed(): Promise<ResolvedStorage | null> {
  try {
    // Probe: try importing the embed package
    await import('@agentix-e/entity-resolution-storage-embed');
    return tryLoadEmbed();
  } catch {
    return null;
  }
}

async function tryDetectRemote(): Promise<ResolvedStorage | null> {
  try {
    await import('@agentix-e/entity-resolution-storage-remote');
    return tryLoadRemote();
  } catch {
    return null;
  }
}

function createMemoryStore(): ResolvedStorage {
  return {
    backend: 'memory',
    store: new MemoryEntityStore() as unknown as ResolvedStorage['store'],
  };
}
