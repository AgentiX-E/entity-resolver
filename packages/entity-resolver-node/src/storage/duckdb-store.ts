// DuckDB embedded storage adapter for entity-resolver-node.
// Uses DuckDB Node.js bindings with JSON-based member storage.
// Falls back to MemoryEntityStore when DuckDB is unavailable.

import type { EntityId } from '@agentix-e/entity-resolver-core';
import type { IEntityStore, ICloseableStore, EntityRecord } from '@agentix-e/entity-resolver-core';
import { MemoryEntityStore } from '@agentix-e/entity-resolver-core';

export interface DuckDBStoreConfig {
  readonly path?: string;
}

/** DuckDB row shape from SQL query results. */
interface DuckDBRow {
  cluster_id: string;
  members_json: string;
  cohesion: number;
}

/**
 * DuckDB-backed IEntityStore.
 * Member IDs are stored as JSON strings for DuckDB Node.js binding compatibility.
 */
export class DuckDBStore implements IEntityStore, ICloseableStore {
  private db: unknown;
  private fallback: MemoryEntityStore;
  private ready = false;

  constructor(db: unknown) {
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
      const db = this.db as { run(sql: string, cb: (err: Error | null) => void): void };
      db.run(
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

  private queryAll(sql: string, ...params: unknown[]): Promise<DuckDBRow[]> {
    return new Promise((resolve) => {
      const db = this.db as { all(sql: string, ...args: unknown[]): void };
      db.all(sql, ...params, (_err: Error | null, rows: DuckDBRow[]) => {
        resolve(rows ?? []);
      });
    });
  }

  private queryRun(sql: string, ...params: unknown[]): Promise<void> {
    return new Promise((resolve) => {
      const db = this.db as { run(sql: string, ...args: unknown[]): void };
      db.run(sql, ...params, () => {
        resolve();
      });
    });
  }

  private rowToEntity(row: DuckDBRow): EntityRecord {
    return {
      clusterId: row.cluster_id,
      memberIds: JSON.parse(row.members_json ?? '[]') as number[],
      cohesion: row.cohesion ?? 0,
    };
  }

  async getEntity(id: EntityId): Promise<EntityRecord | null> {
    if (!this.ready) return this.fallback.getEntity(id);
    const rows = await this.queryAll(
      'SELECT cluster_id, members_json, cohesion FROM er_entities WHERE cluster_id = ? LIMIT 1',
      id,
    );
    return rows.length > 0 ? this.rowToEntity(rows[0]!) : null;
  }

  async queryNeighbors(id: EntityId, hops = 1): Promise<EntityRecord[]> {
    if (!this.ready) return this.fallback.queryNeighbors(id, hops);
    const allRows = await this.queryAll(
      'SELECT cluster_id, members_json, cohesion FROM er_entities',
    );

    const target = allRows.find((r) => r.cluster_id === id);
    if (!target) return [];

    const targetMembers: number[] = JSON.parse(target.members_json ?? '[]');
    const result: EntityRecord[] = [this.rowToEntity(target)];

    if (hops <= 0) return result;

    // BFS via member overlap
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
          result.push(this.rowToEntity(row));
          members.forEach((m) => nextFrontier.add(m));
        }
      }
      frontier = nextFrontier;
    }

    return result;
  }

  async upsertEntity(entity: EntityRecord): Promise<void> {
    if (!this.ready) {
      await this.fallback.upsertEntity(entity);
      return;
    }
    await this.queryRun(
      'INSERT OR REPLACE INTO er_entities (cluster_id, members_json, cohesion) VALUES (?, ?, ?)',
      entity.clusterId,
      JSON.stringify(entity.memberIds),
      entity.cohesion,
    );
  }

  async deleteEntity(id: EntityId): Promise<void> {
    if (!this.ready) {
      await this.fallback.deleteEntity(id);
      return;
    }
    await this.queryRun('DELETE FROM er_entities WHERE cluster_id = ?', id);
  }

  async applyMerge(from: EntityId, into: EntityId): Promise<void> {
    if (!this.ready) {
      await this.fallback.applyMerge(from, into);
      return;
    }
    const fromEntity = await this.getEntity(from);
    const intoEntity = await this.getEntity(into);
    if (fromEntity && intoEntity) {
      const merged = [...new Set([...intoEntity.memberIds, ...fromEntity.memberIds])];
      await this.upsertEntity({
        clusterId: intoEntity.clusterId,
        memberIds: merged,
        cohesion: intoEntity.cohesion,
      });
      await this.deleteEntity(from);
    }
  }

  async applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void> {
    if (!this.ready) {
      await this.fallback.applySplit(entityId, memberGroups);
      return;
    }
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
      const db = this.db as { close(cb: () => void): void };
      db.close(() => {
        resolve();
      });
    });
  }
}
