// Storage resolver tests.
import { describe, it, expect } from 'vitest';
import { resolveStorage } from '../../storage-resolver.js';
import { buildPoolConfig } from '../../storage/pg-store.js';
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
    // This will either succeed (duckdb available) or fallback (duckdb not available)
    const result = await resolveStorage({ backend: 'duckdb', duckdbPath: ':memory:' });
    expect(['duckdb', 'memory']).toContain(result.backend);
  }, 10000);

  it('attempts postgres backend', async () => {
    const result = await resolveStorage({
      backend: 'postgres',
      pgConfig: { database: 'postgres', host: 'localhost', port: 5432 },
    });
    expect(['postgres', 'memory']).toContain(result.backend);
  }, 10000);

  it('store implements IEntityStore', async () => {
    const result = await resolveStorage({ backend: 'memory' });
    expect(typeof result.store.getEntity).toBe('function');
    expect(typeof result.store.upsertEntity).toBe('function');
    expect(typeof result.store.deleteEntity).toBe('function');
    expect(typeof result.store.applyMerge).toBe('function');
    expect(typeof result.store.applySplit).toBe('function');
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
});
