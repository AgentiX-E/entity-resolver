// MemoryEntityStore — pure JS Map-based reference implementation of IEntityStore.
// Zero dependencies. Serves as the default store and testing reference.
//
// All methods are async by IEntityStore contract but internally synchronous
// (Map operations are O(1)). The require-await rule is disabled here because
// these methods intentionally use sync Map operations to fulfill an async interface.

import type { EntityId } from '../types/core.js';
import type { IEntityStore, EntityRecord } from '../interfaces/IEntityStore.js';

/** Internal entity representation with mutable memberIds for merge. */
interface InternalEntity {
  readonly id: EntityId;
  memberIds: number[];
  cohesion: number;
}

export class MemoryEntityStore implements IEntityStore {
  private entities = new Map<EntityId, InternalEntity>();

  // eslint-disable-next-line @typescript-eslint/require-await -- async required by IEntityStore interface; in-memory implementations are synchronous
  async getEntity(id: EntityId): Promise<EntityRecord | null> {
    const e = this.entities.get(id);
    return e ? { clusterId: e.id, memberIds: e.memberIds, cohesion: e.cohesion } : null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async required by IEntityStore interface; in-memory implementations are synchronous
  async queryNeighbors(id: EntityId, hops: number = 1): Promise<EntityRecord[]> {
    const start = this.entities.get(id);
    if (!start) return [];

    if (hops <= 1) {
      // Single-hop: return the entity itself plus entities sharing at least one member
      const result: EntityRecord[] = [
        {
          clusterId: start.id,
          memberIds: [...start.memberIds],
          cohesion: start.cohesion,
        },
      ];
      const memberSet = new Set(start.memberIds);
      for (const [, entity] of this.entities) {
        if (entity.id === id) continue;
        if (entity.memberIds.some((m) => memberSet.has(m))) {
          result.push({
            clusterId: entity.id,
            memberIds: [...entity.memberIds],
            cohesion: entity.cohesion,
          });
        }
      }
      return result;
    }

    // Multi-hop: BFS traversal
    const visited = new Set<EntityId>([id]);
    const queue: EntityId[] = [id];
    const result: EntityRecord[] = [];

    for (let hop = 0; hop < hops; hop++) {
      const nextQueue: EntityId[] = [];
      for (const currentId of queue) {
        const current = this.entities.get(currentId);
        if (!current) continue;
        const memberSet = new Set(current.memberIds);
        for (const [neighborId, neighbor] of this.entities) {
          if (visited.has(neighborId)) continue;
          if (neighbor.memberIds.some((m) => memberSet.has(m))) {
            visited.add(neighborId);
            nextQueue.push(neighborId);
            result.push({
              clusterId: neighbor.id,
              memberIds: [...neighbor.memberIds],
              cohesion: neighbor.cohesion,
            });
          }
        }
      }
      queue.length = 0;
      queue.push(...nextQueue);
    }

    return result;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async required by IEntityStore interface; in-memory implementations are synchronous
  async upsertEntity(entity: EntityRecord): Promise<void> {
    this.entities.set(entity.clusterId, {
      id: entity.clusterId,
      memberIds: [...entity.memberIds],
      cohesion: entity.cohesion,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async required by IEntityStore interface; in-memory implementations are synchronous
  async deleteEntity(id: EntityId): Promise<void> {
    this.entities.delete(id);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async required by IEntityStore interface; in-memory implementations are synchronous
  async applyMerge(from: EntityId, into: EntityId): Promise<void> {
    const fromE = this.entities.get(from);
    const intoE = this.entities.get(into);
    if (fromE && intoE) {
      intoE.memberIds = [...new Set([...intoE.memberIds, ...fromE.memberIds])];
      this.entities.delete(from);
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async required by IEntityStore interface; in-memory implementations are synchronous
  async applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void> {
    this.entities.delete(entityId);
    for (let i = 0; i < memberGroups.length; i++) {
      const gid: EntityId = `${entityId}_split_${String(i)}`;
      this.entities.set(gid, {
        id: gid,
        memberIds: memberGroups[i]!.map(Number),
        cohesion: 0,
      });
    }
  }
}
