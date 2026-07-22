// DuckDB WASM storage for entity-resolution-browser.
// Uses @duckdb/duckdb-wasm to run a full SQL engine in the browser.
// Falls back to MemoryEntityStore when DuckDB WASM is unavailable.

import type { EntityId } from '@agentix-e/entity-resolution-core';
import { MemoryEntityStore } from '@agentix-e/entity-resolution-core';

/**
 * DuckDB WASM-backed IEntityStore for browser environments.
 *
 * Initialization requires downloading DuckDB WASM bundles (~5MB total).
 * Once initialized, provides full SQL-powered entity storage.
 */
export class DuckDBWasmStore {
  private db: any | null = null;
  private conn: any | null = null;
  private fallback: MemoryEntityStore;
  private ready = false;

  constructor() {
    this.fallback = new MemoryEntityStore();
  }

  /** Initialize DuckDB WASM. Call once before using the store. */
  async init(): Promise<void> {
    try {
      const duckdb = await import('@duckdb/duckdb-wasm');

      // Select appropriate bundle based on environment
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      if (!bundle) {
        throw new Error('No DuckDB WASM bundle available');
      }

      // Create worker and instantiate
      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
      );

      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(worker_url);

      this.conn = await this.db.connect();

      // Create schema
      await this.conn.query(
        `CREATE TABLE IF NOT EXISTS er_entities (
           cluster_id VARCHAR PRIMARY KEY,
           members_json VARCHAR DEFAULT '[]',
           cohesion DOUBLE DEFAULT 0
         )`,
      );

      this.ready = true;
    } catch {
      // DuckDB WASM unavailable — use fallback
      this.ready = false;
    }
  }

  async getEntity(id: EntityId): Promise<{ clusterId: string; memberIds: number[]; cohesion: number } | null> {
    if (!this.ready || !this.conn) return this.fallback.getEntity(id);

    try {
      const result = await this.conn.query(
        'SELECT cluster_id, members_json, cohesion FROM er_entities WHERE cluster_id = ?',
        [id],
      );
      const rows = result.toArray();
      if (rows.length === 0) return null;
      const row = rows[0] as any;
      return {
        clusterId: row.cluster_id,
        memberIds: JSON.parse(row.members_json ?? '[]') as number[],
        cohesion: row.cohesion ?? 0,
      };
    } catch {
      return this.fallback.getEntity(id);
    }
  }

  async queryNeighbors(_id: EntityId, _hops?: number): Promise<{ clusterId: string; memberIds: number[]; cohesion: number }[]> {
    if (!this.ready || !this.conn) return this.fallback.queryNeighbors(_id);
    try {
      const result = await this.conn.query('SELECT cluster_id, members_json, cohesion FROM er_entities');
      return result.toArray().map((r: any) => ({
        clusterId: r.cluster_id,
        memberIds: JSON.parse(r.members_json ?? '[]') as number[],
        cohesion: r.cohesion ?? 0,
      }));
    } catch {
      return [];
    }
  }

  async upsertEntity(entity: { clusterId: string; memberIds: number[]; cohesion: number }): Promise<void> {
    if (!this.ready || !this.conn) { await this.fallback.upsertEntity(entity); return; }
    try {
      await this.conn.query(
        'INSERT OR REPLACE INTO er_entities (cluster_id, members_json, cohesion) VALUES (?, ?, ?)',
        [entity.clusterId, JSON.stringify(entity.memberIds), entity.cohesion],
      );
    } catch {
      await this.fallback.upsertEntity(entity);
    }
  }

  async deleteEntity(id: EntityId): Promise<void> {
    if (!this.ready || !this.conn) { await this.fallback.deleteEntity(id); return; }
    try {
      await this.conn.query('DELETE FROM er_entities WHERE cluster_id = ?', [id]);
    } catch {
      await this.fallback.deleteEntity(id);
    }
  }

  async applyMerge(from: EntityId, into: EntityId): Promise<void> {
    const fromE = await this.getEntity(from);
    const intoE = await this.getEntity(into);
    if (fromE && intoE) {
      const merged = [...new Set([...intoE.memberIds, ...fromE.memberIds])];
      await this.upsertEntity({ ...intoE, memberIds: merged });
      await this.deleteEntity(from);
    }
  }

  async applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void> {
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
    if (this.conn) {
      await this.conn.close();
    }
    if (this.db) {
      await this.db.terminate();
    }
  }
}
