// MemoryEntityStore — pure JS Map-based reference implementation of IEntityStore.
// Zero dependencies. Serves as the default store and testing reference.

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

  async getEntity(id: EntityId): Promise<EntityRecord | null> {
    const e = this.entities.get(id);
    return e ? { clusterId: e.id, memberIds: e.memberIds, cohesion: e.cohesion } : null;
  }

  async queryNeighbors(id: EntityId, _hops?: number): Promise<EntityRecord[]> {
    const e = this.entities.get(id);
    return e ? [{ clusterId: e.id, memberIds: e.memberIds, cohesion: e.cohesion }] : [];
  }

  async upsertEntity(entity: EntityRecord): Promise<void> {
    this.entities.set(entity.clusterId, {
      id: entity.clusterId,
      memberIds: [...entity.memberIds],
      cohesion: entity.cohesion,
    });
  }

  async deleteEntity(id: EntityId): Promise<void> {
    this.entities.delete(id);
  }

  async applyMerge(from: EntityId, into: EntityId): Promise<void> {
    const fromE = this.entities.get(from);
    const intoE = this.entities.get(into);
    if (fromE && intoE) {
      intoE.memberIds = [...new Set([...intoE.memberIds, ...fromE.memberIds])];
      this.entities.delete(from);
    }
  }

  async applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void> {
    this.entities.delete(entityId);
    for (let i = 0; i < memberGroups.length; i++) {
      const gid: EntityId = `${entityId}_split_${i}`;
      this.entities.set(gid, {
        id: gid,
        memberIds: memberGroups[i]!.map(Number),
        cohesion: 0,
      });
    }
  }
}
