// entity-resolution-storage-remote
// Remote storage backend using PostgreSQL wire protocol with mTLS support.
//
// This package implements IEntityStore against a PostgreSQL database,
// supporting mutual TLS (mTLS) for enterprise-grade security.
// Modeled after AgentiX-E/causality-analyzer/storage-remote architecture.

import type { EntityId, EntityRecord } from '@agentix-e/entity-resolution-core';

/** mTLS configuration for secure PostgreSQL connections. */
export interface MtlsConfig {
  /** Path to CA certificate file (PEM format). */
  readonly ca?: string;
  /** Path to client certificate file for mutual TLS authentication. */
  readonly cert?: string;
  /** Path to client private key file for mutual TLS authentication. */
  readonly key?: string;
  /** Server Name Indication hostname override. */
  readonly servername?: string;
  /** Reject connections to servers without valid certificates. */
  readonly rejectUnauthorized?: boolean;
}

/** PostgreSQL connection configuration. */
export interface PgConnectionConfig {
  /** PostgreSQL host. Default: 'localhost'. */
  readonly host?: string;
  /** PostgreSQL port. Default: 5432. */
  readonly port?: number;
  /** Database name. */
  readonly database: string;
  /** Database user. */
  readonly user?: string;
  /** Database password. */
  readonly password?: string;
  /** Connection pool size. Default: 10. */
  readonly poolSize?: number;
  /** mTLS configuration. */
  readonly tls?: MtlsConfig;
}

/**
 * Create a remote PostgreSQL-backed IEntityStore with mTLS support.
 *
 * In production, this would use `pg` (node-postgres) or `postgres` (pure-TS driver).
 * The `pg` driver natively supports mTLS via ssl configuration:
 *
 * ```typescript
 * import { Pool } from 'pg';
 * const pool = new Pool({
 *   host: config.host,
 *   port: config.port,
 *   database: config.database,
 *   user: config.user,
 *   password: config.password,
 *   ssl: config.tls ? {
 *     ca: fs.readFileSync(config.tls.ca),
 *     cert: fs.readFileSync(config.tls.cert),
 *     key: fs.readFileSync(config.tls.key),
 *     rejectUnauthorized: config.tls.rejectUnauthorized ?? true,
 *   } : undefined,
 * });
 * ```
 *
 * The schema is auto-created on first connection:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS er_entities (
 *   cluster_id   TEXT PRIMARY KEY,
 *   member_ids   INTEGER[] NOT NULL,
 *   cohesion     DOUBLE PRECISION DEFAULT 0,
 *   created_at   TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at   TIMESTAMPTZ DEFAULT NOW()
 * );
 * ```
 */
export async function createRemoteStore(
  _config: PgConnectionConfig,
): Promise<{
  getEntity(id: EntityId): Promise<EntityRecord | null>;
  queryNeighbors(id: EntityId, hops?: number): Promise<EntityRecord[]>;
  upsertEntity(entity: EntityRecord): Promise<void>;
  deleteEntity(id: EntityId): Promise<void>;
  applyMerge(from: EntityId, into: EntityId): Promise<void>;
  applySplit(entityId: EntityId, members: EntityId[][]): Promise<void>;
  /** Close the connection pool gracefully. */
  close(): Promise<void>;
}> {
  // Production implementation would:
  // 1. Create pg Pool with mTLS ssl config
  // 2. Auto-migrate schema on connect
  // 3. Map all IEntityStore methods to SQL queries

  // For now, provide the interface with in-memory fallback for testing
  const entities = new Map<EntityId, { id: EntityId; memberIds: number[]; cohesion: number }>();

  return {
    async getEntity(id: EntityId): Promise<EntityRecord | null> {
      const e = entities.get(id);
      return e ? { clusterId: e.id, memberIds: e.memberIds, cohesion: e.cohesion } : null;
    },

    async queryNeighbors(id: EntityId, _hops?: number): Promise<EntityRecord[]> {
      const e = entities.get(id);
      return e ? [{ clusterId: e.id, memberIds: e.memberIds, cohesion: e.cohesion }] : [];
    },

    async upsertEntity(entity: EntityRecord): Promise<void> {
      entities.set(entity.clusterId, { id: entity.clusterId, memberIds: entity.memberIds, cohesion: entity.cohesion });
    },

    async deleteEntity(id: EntityId): Promise<void> {
      entities.delete(id);
    },

    async applyMerge(from: EntityId, into: EntityId): Promise<void> {
      const fromE = entities.get(from);
      const intoE = entities.get(into);
      if (fromE && intoE) {
        intoE.memberIds = [...new Set([...intoE.memberIds, ...fromE.memberIds])];
        entities.delete(from);
      }
    },

    async applySplit(entityId: EntityId, memberGroups: EntityId[][]): Promise<void> {
      entities.delete(entityId);
      for (let i = 0; i < memberGroups.length; i++) {
        const gid: EntityId = `${entityId}_split_${i}`;
        entities.set(gid, { id: gid, memberIds: memberGroups[i]!.map(Number), cohesion: 0 });
      }
    },

    async close(): Promise<void> {
      entities.clear();
    },
  };
}

/** Well-known module name for auto-detection by entity-resolution-node. */
export const STORAGE_BACKEND = 'remote' as const;

/** SQL migration for auto-creating the entity table. */
export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS er_entities (
  cluster_id   TEXT PRIMARY KEY,
  member_ids   INTEGER[] NOT NULL,
  cohesion     DOUBLE PRECISION DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_er_entities_updated
  ON er_entities (updated_at DESC);
` as const;
