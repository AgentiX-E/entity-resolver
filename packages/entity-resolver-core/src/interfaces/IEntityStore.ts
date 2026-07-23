// IEntityStore — entity persistence contract for entity-resolver.
// Implemented by: MemoryEntityStore (core), DuckDBStore (node),
// PgEntityStore (node), DuckDBWasmStore (browser).

import type { EntityId } from '../types/core.js';

/**
 * A single entity (cluster) record stored in the entity graph.
 * Represents one real-world entity with its member record IDs.
 */
export interface EntityRecord {
  readonly clusterId: string;
  readonly memberIds: readonly number[];
  readonly cohesion: number;
}

/**
 * Persistence contract for the entity graph.
 *
 * All implementations must handle the following semantics:
 * - `queryNeighbors`: returns entities that share at least one member record.
 * - `applyMerge`: atomic merge — after completion, `into` contains union of
 *   members, `from` no longer exists.
 * - `applySplit`: atomic split — after completion, original entity is gone,
 *   replaced by N new entities.
 * - `deleteEntity`: idempotent — deleting a non-existent entity is a no-op.
 */
export interface IEntityStore {
  /** Retrieve a single entity by its cluster ID. Returns null if not found. */
  getEntity(id: EntityId): Promise<EntityRecord | null>;

  /**
   * Find neighboring entities via member overlap.
   * @param id — starting entity
   * @param hops — how many levels of neighbor expansion (default: 1)
   * @returns entities with overlapping memberIds, ordered by proximity
   */
  queryNeighbors(id: EntityId, hops?: number): Promise<EntityRecord[]>;

  /** Insert or update an entity record. */
  upsertEntity(entity: EntityRecord): Promise<void>;

  /** Remove an entity from the store. Idempotent. */
  deleteEntity(id: EntityId): Promise<void>;

  /**
   * Merge entity `from` into entity `into`.
   * After completion: `into` contains union of both member sets,
   * `from` is deleted from the store.
   */
  applyMerge(from: EntityId, into: EntityId): Promise<void>;

  /**
   * Split an entity into multiple sub-entities.
   * After completion: original entity is deleted,
   * N new entities are created with IDs `${entityId}_split_0..N-1`.
   */
  applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void>;
}

/**
 * Optional resource cleanup. Implemented by stores that hold external
 * connections (database pools, WASM workers).
 */
export interface ICloseableStore {
  close(): Promise<void>;
}
