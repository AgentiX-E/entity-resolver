// MemoryEntityStore — pure JS Map-based reference implementation of IEntityStore.
// Zero dependencies. Serves as the default store and testing reference.

import type { EntityId } from '../types/core.js';

export class MemoryEntityStore {
  private entities = new Map<EntityId, { id: EntityId; memberIds: number[]; cohesion: number }>();

  async getEntity(id: EntityId): Promise<{ clusterId: string; memberIds: number[]; cohesion: number } | null> {
    const e = this.entities.get(id);
    return e ? { clusterId: e.id, memberIds: e.memberIds, cohesion: e.cohesion } : null;
  }

  async queryNeighbors(id: EntityId, _hops?: number): Promise<{ clusterId: string; memberIds: number[]; cohesion: number }[]> {
    const e = this.entities.get(id);
    return e ? [{ clusterId: e.id, memberIds: e.memberIds, cohesion: e.cohesion }] : [];
  }

  async upsertEntity(entity: { clusterId: string; memberIds: number[]; cohesion: number }): Promise<void> {
    this.entities.set(entity.clusterId, { id: entity.clusterId, memberIds: entity.memberIds, cohesion: entity.cohesion });
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
      this.entities.set(gid, { id: gid, memberIds: memberGroups[i]!.map(Number), cohesion: 0 });
    }
  }
}
