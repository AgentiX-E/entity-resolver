// DuckDB embedded storage adapter for entity-resolver-node.
// Uses DuckDB Node.js bindings with JSON-based member storage.
// Falls back to MemoryEntityStore when DuckDB is unavailable.

import type { EntityId } from '@agentix-e/entity-resolver-core';
import { MemoryEntityStore } from '@agentix-e/entity-resolver-core';

export interface DuckDBStoreConfig {
  readonly path?: string;
}

/**
 * DuckDB-backed IEntityStore.
 * Member IDs are stored as JSON strings for DuckDB Node.js binding compatibility.
 */
export class DuckDBStore {
  private db: any;
  private fallback: MemoryEntityStore;
  private ready = false;

  constructor(db: any) {
    this.db = db;
    this.fallback = new MemoryEntityStore();
  }

  static async create(config?: DuckDBStoreConfig): Promise<DuckDBStore> {
    const { Database } = await import('duckdb');
    const db = new Database(config?.path ?? ':memory:');
    const store = new DuckDBStore(db);
    await store.init();
    return store;
  }

  private init(): Promise<void> {
    return new Promise((resolve) => {
      this.db.run(
        `CREATE TABLE IF NOT EXISTS er_entities (
           cluster_id VARCHAR PRIMARY KEY,
           members_json VARCHAR DEFAULT '[]',
           cohesion DOUBLE DEFAULT 0
         )`,
        (err: Error | null) => {
          this.ready = !err;
          resolve();
        },
      );
    });
  }

  async getEntity(id: EntityId): Promise<{ clusterId: string; memberIds: number[]; cohesion: number } | null> {
    if (!this.ready) return this.fallback.getEntity(id);
    return new Promise((resolve) => {
      this.db.all(
        'SELECT cluster_id, members_json, cohesion FROM er_entities WHERE cluster_id = ? LIMIT 1',
        id,
        (err: Error | null, rows: any[]) => {
          if (err || !rows || rows.length === 0) { resolve(null); return; }
          const row = rows[0];
          resolve({
            clusterId: row.cluster_id,
            memberIds: JSON.parse(row.members_json ?? '[]') as number[],
            cohesion: row.cohesion ?? 0,
          });
        },
      );
    });
  }

  async queryNeighbors(id: EntityId, hops: number = 1): Promise<{ clusterId: string; memberIds: number[]; cohesion: number }[]> {
    if (!this.ready) return this.fallback.queryNeighbors(id, hops);
    return new Promise((resolve) => {
      this.db.all(
        'SELECT cluster_id, members_json, cohesion FROM er_entities',
        (err: Error | null, allRows: any[]) => {
          if (err) { resolve([]); return; }

          // Find the target entity
          const target = allRows.find((r: any) => r.cluster_id === id);
          if (!target) { resolve([]); return; }

          const targetMembers: number[] = JSON.parse(target.members_json ?? '[]');
          const result = [{
            clusterId: target.cluster_id,
            memberIds: targetMembers,
            cohesion: target.cohesion ?? 0,
          }];

          if (hops <= 0) { resolve(result); return; }

          // Find neighbors via member overlap (BFS limited to hops iterations)
          const visited = new Set<string>([id]);
          let frontier = new Set<number>(targetMembers);
          let remaining = hops;

          while (remaining > 0 && frontier.size > 0) {
            remaining--;
            const nextFrontier = new Set<number>();
            for (const row of allRows) {
              if (visited.has(row.cluster_id)) continue;
              const members: number[] = JSON.parse(row.members_json ?? '[]');
              if (members.some((m) => frontier.has(m))) {
                visited.add(row.cluster_id);
                result.push({
                  clusterId: row.cluster_id,
                  memberIds: members,
                  cohesion: row.cohesion ?? 0,
                });
                members.forEach((m) => nextFrontier.add(m));
              }
            }
            frontier = nextFrontier;
          }

          resolve(result);
        },
      );
    });
  }

  async upsertEntity(entity: { clusterId: string; memberIds: number[]; cohesion: number }): Promise<void> {
    if (!this.ready) { await this.fallback.upsertEntity(entity); return; }
    return new Promise((resolve) => {
      this.db.run(
        'INSERT OR REPLACE INTO er_entities (cluster_id, members_json, cohesion) VALUES (?, ?, ?)',
        entity.clusterId, JSON.stringify(entity.memberIds), entity.cohesion,
        () => resolve(),
      );
    });
  }

  async deleteEntity(id: EntityId): Promise<void> {
    if (!this.ready) { await this.fallback.deleteEntity(id); return; }
    return new Promise((resolve) => {
      this.db.run('DELETE FROM er_entities WHERE cluster_id = ?', id, () => resolve());
    });
  }

  async applyMerge(from: EntityId, into: EntityId): Promise<void> {
    if (!this.ready) { await this.fallback.applyMerge(from, into); return; }
    const fromEntity = await this.getEntity(from);
    const intoEntity = await this.getEntity(into);
    if (fromEntity && intoEntity) {
      const merged = [...new Set([...intoEntity.memberIds, ...fromEntity.memberIds])];
      await this.upsertEntity({ ...intoEntity, memberIds: merged });
      await this.deleteEntity(from);
    }
  }

  async applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void> {
    if (!this.ready) { await this.fallback.applySplit(entityId, memberGroups); return; }
    await this.deleteEntity(entityId);
    for (let i = 0; i < memberGroups.length; i++) {
      await this.upsertEntity({
        clusterId: `${entityId}_split_${i}`,
        memberIds: memberGroups[i]!.map(Number),
        cohesion: 0,
      });
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }
}
