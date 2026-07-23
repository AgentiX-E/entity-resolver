// PostgreSQL storage adapter with mTLS support.
// Uses the `pg` driver for real PostgreSQL wire-protocol connections.
// Implements core's IEntityStore interface via SQL.

import type { EntityId } from '@agentix-e/entity-resolver-core';
import type { IEntityStore, ICloseableStore, EntityRecord } from '@agentix-e/entity-resolver-core';
import type { Pool, PoolConfig } from 'pg';

/** mTLS configuration — all paths in PEM format. */
export interface PgTlsConfig {
  /** Path to CA certificate (PEM). */
  readonly ca?: string;
  /** Path to client certificate for mutual TLS (PEM). */
  readonly cert?: string;
  /** Path to client private key for mutual TLS (PEM). */
  readonly key?: string;
  /** Server Name Indication override. */
  readonly servername?: string;
  /** Reject unauthorized certificates (default: true). */
  readonly rejectUnauthorized?: boolean;
}

/** PostgreSQL connection configuration. */
export interface PgStoreConfig {
  readonly host?: string;
  readonly port?: number;
  readonly database: string;
  readonly user?: string;
  readonly password?: string;
  readonly tls?: PgTlsConfig;
  readonly poolSize?: number;
  /** Schema name for ER tables. Default: 'public'. */
  readonly _schema?: string;
}

/** Shape of a row returned from pg query. */
interface PgEntityRow {
  cluster_id: string;
  member_ids: number[];
  cohesion: number;
}

// ══════════════════════════════════════════════════════════════
// SQL migration
// ══════════════════════════════════════════════════════════════

export const ER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS er_entities (
  cluster_id   TEXT PRIMARY KEY,
  member_ids   INTEGER[] NOT NULL DEFAULT '{}',
  cohesion     DOUBLE PRECISION DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_er_entities_updated
  ON er_entities (updated_at DESC);
` as const;

/** SSL configuration type for the pg driver. */
interface PgSSLConfig {
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
  servername?: string;
}

/**
 * Build a pg PoolConfig from our config with mTLS support.
 * This is a pure function — testable without a real database.
 */
export function buildPoolConfig(config: PgStoreConfig): PoolConfig {
  const poolConfig: PoolConfig = {
    host: config.host ?? 'localhost',
    port: config.port ?? 5432,
    database: config.database,
    user: config.user ?? process.env['PGUSER'] ?? 'postgres',
    password: config.password ?? process.env['PGPASSWORD'],
    max: config.poolSize ?? 10,
  };

  // mTLS configuration
  if (config.tls) {
    const ssl: PgSSLConfig = {
      rejectUnauthorized: config.tls.rejectUnauthorized ?? true,
    };
    if (config.tls.ca) {
      try {
        ssl.ca = readPemFile(config.tls.ca);
      } catch {
        ssl.ca = config.tls.ca;
      }
    }
    if (config.tls.cert) {
      try {
        ssl.cert = readPemFile(config.tls.cert);
      } catch {
        ssl.cert = config.tls.cert;
      }
    }
    if (config.tls.key) {
      try {
        ssl.key = readPemFile(config.tls.key);
      } catch {
        ssl.key = config.tls.key;
      }
    }
    if (config.tls.servername) {
      ssl.servername = config.tls.servername;
    }
    poolConfig.ssl = ssl;
  }

  return poolConfig;
}

/** Read a PEM file. If the path contains PEM content directly, return it. */
function readPemFile(path: string): string {
  const fs = require('fs');
  return fs.readFileSync(path, 'utf-8');
}

/** Convert a pg row to an EntityRecord. */
function rowToEntity(row: PgEntityRow): EntityRecord {
  return {
    clusterId: row.cluster_id,
    memberIds: row.member_ids,
    cohesion: row.cohesion,
  };
}

// ══════════════════════════════════════════════════════════════
// PgEntityStore — PostgreSQL-backed IEntityStore with mTLS
// ══════════════════════════════════════════════════════════════

export class PgEntityStore implements IEntityStore, ICloseableStore {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /** Create a store from configuration. Connects with full mTLS support. */
  static async create(config: PgStoreConfig): Promise<PgEntityStore> {
    const { Pool } = await import('pg');
    const poolConfig = buildPoolConfig(config);
    const pool = new Pool(poolConfig);
    const store = new PgEntityStore(pool);
    await store.migrate();
    return store;
  }

  /** Run schema migration. */
  async migrate(): Promise<void> {
    await this.pool.query(ER_SCHEMA_SQL);
  }

  /** Get an entity by its cluster ID. */
  async getEntity(id: EntityId): Promise<EntityRecord | null> {
    const result = await this.pool.query<PgEntityRow>(
      'SELECT cluster_id, member_ids, cohesion FROM er_entities WHERE cluster_id = $1',
      [id],
    );
    if (result.rows.length === 0) return null;
    return rowToEntity(result.rows[0]!);
  }

  /** Query neighboring entities by member overlap. */
  async queryNeighbors(id: EntityId, hops?: number): Promise<EntityRecord[]> {
    const limit = (hops ?? 1) * 10;
    const result = await this.pool.query<PgEntityRow>(
      'SELECT cluster_id, member_ids, cohesion FROM er_entities WHERE member_ids && (SELECT member_ids FROM er_entities WHERE cluster_id = $1) LIMIT $2',
      [id, limit],
    );
    return result.rows.map(rowToEntity);
  }

  /** Upsert an entity. */
  async upsertEntity(entity: EntityRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO er_entities (cluster_id, member_ids, cohesion, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (cluster_id) DO UPDATE SET
         member_ids = EXCLUDED.member_ids,
         cohesion = EXCLUDED.cohesion,
         updated_at = NOW()`,
      [entity.clusterId, entity.memberIds, entity.cohesion],
    );
  }

  /** Delete an entity. */
  async deleteEntity(id: EntityId): Promise<void> {
    await this.pool.query('DELETE FROM er_entities WHERE cluster_id = $1', [id]);
  }

  /** Merge two entities. */
  async applyMerge(from: EntityId, into: EntityId): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const fromResult = await client.query<PgEntityRow>(
        'SELECT member_ids FROM er_entities WHERE cluster_id = $1',
        [from],
      );
      if (fromResult.rows.length > 0) {
        const fromMembers = fromResult.rows[0]!.member_ids;
        await client.query(
          `UPDATE er_entities SET member_ids = (
            SELECT ARRAY(SELECT DISTINCT unnest(member_ids || $1::int[]))
          ), updated_at = NOW() WHERE cluster_id = $2`,
          [fromMembers, into],
        );
        await client.query('DELETE FROM er_entities WHERE cluster_id = $1', [from]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Split an entity into multiple groups. */
  async applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM er_entities WHERE cluster_id = $1', [entityId]);
      for (let i = 0; i < memberGroups.length; i++) {
        await client.query(
          'INSERT INTO er_entities (cluster_id, member_ids, cohesion) VALUES ($1, $2, 0)',
          [`${entityId}_split_${i}`, memberGroups[i]!.map(Number)],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Close the connection pool gracefully. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
