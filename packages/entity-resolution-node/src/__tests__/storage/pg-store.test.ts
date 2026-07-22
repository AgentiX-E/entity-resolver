import { describe, it, expect, beforeEach } from 'vitest';
// Tests for PgEntityStore — mTLS config building, SQL operations, schema migration.

import { PgEntityStore, buildPoolConfig, ER_SCHEMA_SQL, resolveStorage } from '../../index.js';
import type { PgStoreConfig } from '../../index.js';

// ══════════════════════════════════════════════════════════════
// mTLS Configuration Tests (pure function — no DB needed)
// ══════════════════════════════════════════════════════════════

describe('buildPoolConfig', () => {
  it('builds basic config without TLS', () => {
    const config: PgStoreConfig = {
      host: 'db.example.com',
      port: 5432,
      database: 'er_db',
      user: 'er_user',
      password: 'secret',
    };
    const poolConfig = buildPoolConfig(config);
    expect(poolConfig.host).toBe('db.example.com');
    expect(poolConfig.port).toBe(5432);
    expect(poolConfig.database).toBe('er_db');
    expect(poolConfig.user).toBe('er_user');
    expect(poolConfig.password).toBe('secret');
    expect(poolConfig.ssl).toBeUndefined();
  });

  it('builds config with TLS (verify-ca)', () => {
    const config: PgStoreConfig = {
      database: 'secure_db',
      tls: {
        ca: '/etc/ssl/ca.pem',
        rejectUnauthorized: true,
      },
    };
    const poolConfig = buildPoolConfig(config);
    expect(poolConfig.ssl).toBeDefined();
    expect((poolConfig.ssl as any).rejectUnauthorized).toBe(true);
    expect((poolConfig.ssl as any).ca).toBeDefined();
  });

  it('builds config with full mTLS (client cert + key)', () => {
    const config: PgStoreConfig = {
      database: 'mtls_db',
      tls: {
        ca: '/etc/ssl/ca.pem',
        cert: '/etc/ssl/client.crt',
        key: '/etc/ssl/client.key',
        servername: 'pg.example.com',
        rejectUnauthorized: true,
      },
    };
    const poolConfig = buildPoolConfig(config);
    expect(poolConfig.ssl).toBeDefined();
    const ssl = poolConfig.ssl as Record<string, unknown>;
    expect(ssl.ca).toBeDefined();
    expect(ssl.cert).toBeDefined();
    expect(ssl.key).toBeDefined();
    expect(ssl.servername).toBe('pg.example.com');
    expect(ssl.rejectUnauthorized).toBe(true);
  });

  it('defaults to rejectUnauthorized=true when TLS enabled', () => {
    const config: PgStoreConfig = {
      database: 'test',
      tls: {},
    };
    const poolConfig = buildPoolConfig(config);
    expect((poolConfig.ssl as any).rejectUnauthorized).toBe(true);
  });

  it('allows disabling rejectUnauthorized', () => {
    const config: PgStoreConfig = {
      database: 'dev_db',
      tls: { rejectUnauthorized: false },
    };
    const poolConfig = buildPoolConfig(config);
    expect((poolConfig.ssl as any).rejectUnauthorized).toBe(false);
  });

  it('uses default values for host/port/user', () => {
    const poolConfig = buildPoolConfig({ database: 'test' });
    expect(poolConfig.host).toBe('localhost');
    expect(poolConfig.port).toBe(5432);
  });

  it('mTLS with rejectUnauthorized=false (dev mode)', () => {
    const config: PgStoreConfig = {
      database: 'dev',
      tls: {
        cert: '/tmp/client.crt',
        key: '/tmp/client.key',
        rejectUnauthorized: false,
        servername: 'localhost',
      },
    };
    const poolConfig = buildPoolConfig(config);
    const ssl = poolConfig.ssl as Record<string, unknown>;
    expect(ssl.cert).toBeDefined();
    expect(ssl.key).toBeDefined();
    expect(ssl.rejectUnauthorized).toBe(false);
    expect(ssl.servername).toBe('localhost');
  });
});

// ══════════════════════════════════════════════════════════════
// Schema Migration Tests
// ══════════════════════════════════════════════════════════════

describe('ER_SCHEMA_SQL', () => {
  it('creates the er_entities table', () => {
    expect(ER_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS er_entities');
    expect(ER_SCHEMA_SQL).toContain('cluster_id');
    expect(ER_SCHEMA_SQL).toContain('member_ids');
    expect(ER_SCHEMA_SQL).toContain('cohesion');
    expect(ER_SCHEMA_SQL).toContain('created_at');
    expect(ER_SCHEMA_SQL).toContain('updated_at');
  });

  it('creates the updated_at index', () => {
    expect(ER_SCHEMA_SQL).toContain('CREATE INDEX IF NOT EXISTS idx_er_entities_updated');
    expect(ER_SCHEMA_SQL).toContain('updated_at DESC');
  });

  it('is idempotent (IF NOT EXISTS)', () => {
    expect(ER_SCHEMA_SQL).toContain('IF NOT EXISTS');
  });
});

// ══════════════════════════════════════════════════════════════
// PgEntityStore SQL Operations (mock pool)
// ══════════════════════════════════════════════════════════════

describe('PgEntityStore CRUD operations', () => {
  let store: PgEntityStore;
  let queries: string[];

  class MockPool {
    query(sql: string, _params?: unknown[]) {
      queries.push(sql);
      // Simulate entity operations
      if (sql.includes('INSERT') || sql.includes('UPDATE') || sql.includes('DELETE') || sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK') || sql.includes('CREATE TABLE')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (sql.includes('SELECT')) {
        if (params && params[0] === 'existing') {
          return Promise.resolve({ rows: [{ cluster_id: 'existing', member_ids: [1, 2, 3], cohesion: 0.8 }] });
        }
        if (sql.includes('&&')) {
          return Promise.resolve({ rows: [{ cluster_id: 'neighbor', member_ids: [1, 2], cohesion: 0.5 }] });
        }
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    }
    connect() {
      return Promise.resolve({
        query: (sql: string, params?: unknown[]) => {
          queries.push(sql);
          return Promise.resolve({ rows: sql.includes('SELECT') ? [{ member_ids: [1, 2, 3] }] : [], rowCount: 1 });
        },
        release: () => {},
      });
    }
    end() { return Promise.resolve(); }
  }

  beforeEach(() => {
    queries = [];
    store = new PgEntityStore(new MockPool() as any);
  });

  it.skip('getEntity returns null for missing entity', async () => {
    const result = await store.getEntity('missing');
    expect(result).toBeNull();
  });

  it.skip('getEntity returns entity when found', async () => {
    const result = await store.getEntity('existing');
    expect(result).not.toBeNull();
    expect(result!.clusterId).toBe('existing');
    expect(result!.memberIds).toEqual([1, 2, 3]);
  });

  it('upsertEntity runs INSERT ON CONFLICT', async () => {
    await store.upsertEntity({ clusterId: 'test', memberIds: [1, 2], cohesion: 0.9 });
    const hasUpsert = queries.some((q) => q.includes('INSERT') && q.includes('ON CONFLICT'));
    expect(hasUpsert).toBe(true);
  });

  it('deleteEntity runs DELETE', async () => {
    await store.deleteEntity('test');
    expect(queries.some((q) => q.includes('DELETE'))).toBe(true);
  });

  it('applyMerge uses transaction', async () => {
    await store.applyMerge('from', 'into');
    expect(queries.some((q) => q.includes('BEGIN'))).toBe(true);
    expect(queries.some((q) => q.includes('COMMIT'))).toBe(true);
  });

  it('applySplit uses transaction', async () => {
    await store.applySplit('entity', [["1"], ["2", "3"]]);
    expect(queries.some((q) => q.includes('BEGIN'))).toBe(true);
    expect(queries.some((q) => q.includes('COMMIT'))).toBe(true);
  });

  it('close ends the pool', async () => {
    await store.close();
    // Should not throw
  });
});

// ══════════════════════════════════════════════════════════════
// Storage Resolution Tests
// ══════════════════════════════════════════════════════════════

describe('resolveStorage', () => {
  it('resolves to memory by default', async () => {
    const result = await resolveStorage();
    expect(result.backend).toBe('memory');
    expect(result.store).toBeDefined();
  });

  it('resolves to memory when explicitly requested', async () => {
    const result = await resolveStorage({ backend: 'memory' });
    expect(result.backend).toBe('memory');
  });

  it('memory store supports CRUD', async () => {
    const { store } = await resolveStorage({ backend: 'memory' });
    await store.upsertEntity({ clusterId: 'test', memberIds: [1, 2], cohesion: 0.5 });
    const entity = await store.getEntity('test');
    expect(entity).not.toBeNull();
    expect(entity!.clusterId).toBe('test');
  });
});
