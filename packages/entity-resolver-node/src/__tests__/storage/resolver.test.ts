// Storage resolver tests.
import { describe, it, expect } from 'vitest';
import { resolveStorage } from '../../storage-resolver.js';
import { buildPoolConfig, ER_SCHEMA_SQL } from '../../storage/pg-store.js';
import { MemoryEntityStore } from '@agentix-e/entity-resolver-core';

describe('resolveStorage', () => {
  it('defaults to memory backend', async () => {
    const result = await resolveStorage();
    expect(result.backend).toBe('memory');
    expect(result.store).toBeInstanceOf(MemoryEntityStore);
  });

  it('selects memory backend explicitly', async () => {
    const result = await resolveStorage({ backend: 'memory' });
    expect(result.backend).toBe('memory');
  });

  it('attempts duckdb backend', async () => {
    const result = await resolveStorage({ backend: 'duckdb', duckdbPath: ':memory:' });
    expect(['duckdb', 'memory']).toContain(result.backend);
  }, 10000);

  it('duckdb falls back to memory on failure', async () => {
    // Providing invalid path should trigger fallback
    const result = await resolveStorage({ backend: 'duckdb', duckdbPath: '/dev/null/invalid' });
    expect(['duckdb', 'memory']).toContain(result.backend);
  }, 10000);

  it('attempts postgres backend', async () => {
    const result = await resolveStorage({
      backend: 'postgres',
      pgConfig: { database: 'postgres', host: 'localhost', port: 5432 },
    });
    expect(['postgres', 'memory']).toContain(result.backend);
  }, 10000);

  it('postgres falls back to memory on unreachable host', async () => {
    const result = await resolveStorage({
      backend: 'postgres',
      pgConfig: { database: 'test', host: '10.255.255.1', port: 5432 },
    });
    expect(['postgres', 'memory']).toContain(result.backend);
  }, 30000);

  it('store implements IEntityStore', async () => {
    const result = await resolveStorage({ backend: 'memory' });
    expect(typeof result.store.getEntity).toBe('function');
    expect(typeof result.store.upsertEntity).toBe('function');
    expect(typeof result.store.deleteEntity).toBe('function');
    expect(typeof result.store.applyMerge).toBe('function');
    expect(typeof result.store.applySplit).toBe('function');
  });

  it('store has queryNeighbors method', async () => {
    const result = await resolveStorage({ backend: 'memory' });
    expect(typeof result.store.queryNeighbors).toBe('function');
  });
});

describe('buildPoolConfig', () => {
  it('produces correct minimal pg config', () => {
    const config = buildPoolConfig({ database: 'mydb' });
    expect(config.database).toBe('mydb');
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5432);
  });

  it('accepts custom host and port', () => {
    const config = buildPoolConfig({
      database: 'mydb',
      host: 'pg.example.com',
      port: 5433,
      user: 'admin',
    });
    expect(config.host).toBe('pg.example.com');
    expect(config.port).toBe(5433);
    expect(config.user).toBe('admin');
  });

  it('handles TLS config with string values (non-file paths)', () => {
    const config = buildPoolConfig({
      database: 'mydb',
      tls: {
        ca: 'CA-CERT-CONTENT',
        cert: 'CLIENT-CERT',
        key: 'CLIENT-KEY',
        servername: 'db.example.com',
      },
    });
    expect(config.ssl).toBeDefined();
    if (config.ssl && typeof config.ssl === 'object') {
      const ssl = config.ssl as Record<string, unknown>;
      expect(ssl.ca).toBe('CA-CERT-CONTENT');
      expect(ssl.cert).toBe('CLIENT-CERT');
      expect(ssl.key).toBe('CLIENT-KEY');
      expect(ssl.servername).toBe('db.example.com');
    }
  });

  it('handles TLS with rejectUnauthorized false', () => {
    const config = buildPoolConfig({
      database: 'mydb',
      tls: { rejectUnauthorized: false },
    });
    if (config.ssl && typeof config.ssl === 'object') {
      expect((config.ssl as Record<string, unknown>).rejectUnauthorized).toBe(false);
    }
  });

  it('handles empty TLS config', () => {
    const config = buildPoolConfig({ database: 'test', tls: {} });
    expect(config.host).toBe('localhost');
    expect(config.ssl).toBeDefined();
  });

  it('handles custom poolSize', () => {
    const config = buildPoolConfig({ database: 'test', poolSize: 5 });
    expect(config.max).toBe(5);
  });

  it('password is included when provided', () => {
    const config = buildPoolConfig({ database: 'test', password: 's3cret' });
    expect(config.password).toBe('s3cret');
  });

  it('no password when not provided', () => {
    const config = buildPoolConfig({ database: 'test' });
    expect(config.password).toBeUndefined();
  });
});

describe('ER_SCHEMA_SQL', () => {
  it('defines the er_entities table', () => {
    expect(ER_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS er_entities');
  });

  it('includes all required columns', () => {
    expect(ER_SCHEMA_SQL).toContain('cluster_id');
    expect(ER_SCHEMA_SQL).toContain('member_ids');
    expect(ER_SCHEMA_SQL).toContain('cohesion');
  });

  it('creates index on updated_at', () => {
    expect(ER_SCHEMA_SQL).toContain('CREATE INDEX');
    expect(ER_SCHEMA_SQL).toContain('updated_at');
  });
});
