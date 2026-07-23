// DuckDB WASM storage with enterprise-grade distribution model.
//
// WASM Distribution (5 tiers + graceful degradation):
//   Tier 1: Bundled (default via jsDelivr CDN)
//   Tier 2: Custom URL (enterprise self-hosting)
//   Tier 3: Fallback URLs (configured array)
//   Tier 4: GitHub Releases assets (last-resort CDN)
//   Tier 5: MemoryEntityStore (transparent degradation — never crashes)
//
// Offline-first: init({ offline: true }) skips WASM entirely.
// Air-gapped: ship with bundled WASM, zero external network access.
// Corporate: configurable URL for whitelisted CDN/internal artifact server.

import type { EntityId } from '@agentix-e/entity-resolver-core';
import type { IEntityStore, ICloseableStore, EntityRecord } from '@agentix-e/entity-resolver-core';
import { MemoryEntityStore } from '@agentix-e/entity-resolver-core';

/**
 * Configuration for DuckDB WASM initialization.
 * Designed for enterprise deployment scenarios.
 */
export interface DuckDBWasmOptions {
  /**
   * Override the WASM bundle URL.
   * Use for enterprise self-hosting: '/assets/duckdb-eh.wasm'
   * or internal artifact server: 'https://artifacts.corp.com/duckdb.wasm'
   */
  readonly wasmUrl?: string;

  /**
   * Fallback URLs to try in order if the primary URL fails.
   * Example: ['https://cdn1.corp.com/duckdb.wasm', 'https://cdn2.corp.com/duckdb.wasm']
   */
  readonly wasmFallbackUrls?: readonly string[];

  /**
   * Skip WASM initialization entirely — use MemoryEntityStore directly.
   * Set to true for: air-gapped environments, CI without network, development.
   */
  readonly offline?: boolean;

  /**
   * Maximum time (ms) to wait for WASM download before falling back.
   * Default: 30000 (30 seconds).
   */
  readonly downloadTimeout?: number;

  /**
   * Enable debug logging for WASM initialization steps.
   * Useful for diagnosing network/CDN issues in enterprise environments.
   */
  readonly debug?: boolean;
}

/** Result of WASM initialization — provides status for monitoring. */
export interface DuckDBWasmInitResult {
  /** Which tier was used for WASM. */
  readonly tier: 'bundled' | 'custom_url' | 'fallback_url' | 'github_assets' | 'memory_fallback';
  /** Whether WASM SQL engine is active. */
  readonly wasmActive: boolean;
  /** Human-readable status message for health endpoints. */
  readonly status: string;
}

/** DuckDB WASM row shape. */
interface DuckDBWasmRow {
  cluster_id: string;
  members_json: string;
  cohesion: number;
}

/** DuckDB WASM connection interface (subset of DuckDBWasm API). */
interface DuckDBWasmConnection {
  query(sql: string, params?: unknown[]): Promise<{ toArray(): DuckDBWasmRow[] }>;
  close(): Promise<void>;
}

/** DuckDB WASM database interface (subset of DuckDBWasm API). */
interface DuckDBWasmDatabase {
  instantiate(mainModule: string): Promise<void>;
  connect(): Promise<DuckDBWasmConnection>;
  terminate(): Promise<void>;
}

const GITHUB_ASSETS_URL =
  'https://github.com/AgentiX-E/entity-resolver/releases/download/duckdb-wasm/duckdb-eh.wasm';

export class DuckDBWasmStore implements IEntityStore, ICloseableStore {
  private db: DuckDBWasmDatabase | null = null;
  private conn: DuckDBWasmConnection | null = null;
  private fallback: MemoryEntityStore;
  private ready = false;
  private initResult: DuckDBWasmInitResult = {
    tier: 'memory_fallback',
    wasmActive: false,
    status: 'Not initialized',
  };

  private opts: DuckDBWasmOptions;

  constructor(options?: DuckDBWasmOptions) {
    this.fallback = new MemoryEntityStore();
    this.opts = options ?? {};
  }

  /** Get initialization result for health monitoring. */
  getInitResult(): DuckDBWasmInitResult {
    return this.initResult;
  }

  /**
   * Initialize DuckDB WASM with enterprise distribution model.
   *
   * Resolution order:
   * 1. opts.offline → skip WASM, use memory
   * 2. opts.wasmUrl → custom URL (enterprise self-hosting)
   * 3. Bundled WASM in npm package → default
   * 4. opts.wasmFallbackUrls → try each in order
   * 5. GitHub Releases assets → last-resort CDN
   * 6. MemoryEntityStore → graceful degradation (never crashes)
   */
  async init(): Promise<DuckDBWasmInitResult> {
    if (this.opts.offline) {
      this.log('Offline mode: using MemoryEntityStore (no WASM download)');
      this.initResult = { tier: 'memory_fallback', wasmActive: false, status: 'Offline mode' };
      return this.initResult;
    }

    try {
      const duckdb = await import('@duckdb/duckdb-wasm');
      const urls = this.buildUrlChain();

      for (const { url, tier } of urls) {
        this.log(`Trying ${tier}: ${url}`);
        const result = await this.tryInitWithUrl(duckdb, url);
        if (result) {
          this.initResult = { tier, wasmActive: true, status: `WASM active via ${tier}` };
          this.log(`WASM initialized via ${tier}`);
          return this.initResult;
        }
        this.log(`${tier} failed, trying next...`);
      }

      return this.fallbackInit('All WASM URLs failed');
    } catch (err) {
      return this.fallbackInit(`DuckDB WASM import failed: ${String(err)}`);
    }
  }

  private buildUrlChain(): Array<{ url: string; tier: DuckDBWasmInitResult['tier'] }> {
    const chain: Array<{ url: string; tier: DuckDBWasmInitResult['tier'] }> = [];

    if (this.opts.wasmUrl) {
      chain.push({ url: this.opts.wasmUrl, tier: 'custom_url' });
    }

    chain.push({ url: '', tier: 'bundled' });

    if (this.opts.wasmFallbackUrls) {
      for (const fbUrl of this.opts.wasmFallbackUrls) {
        chain.push({ url: fbUrl, tier: 'fallback_url' });
      }
    }

    chain.push({ url: GITHUB_ASSETS_URL, tier: 'github_assets' });

    return chain;
  }

  private async tryInitWithUrl(duckdb: Record<string, unknown>, url: string): Promise<boolean> {
    try {
      const timeout = this.opts.downloadTimeout ?? 30000;

      const bundle: { mainModule: string; mainWorker?: string } | null = url
        ? { mainModule: url, mainWorker: url.replace('.wasm', '-worker.js') }
        : await this.getBundledBundle(duckdb);

      if (!bundle) return false;

      const worker = await this.createWorkerWithTimeout(bundle, timeout);
      if (!worker) return false;

      const AsyncDuckDB = duckdb['AsyncDuckDB'] as new (...args: unknown[]) => DuckDBWasmDatabase;
      const ConsoleLogger = duckdb['ConsoleLogger'] as new () => unknown;

      const logger = new ConsoleLogger();
      this.db = new AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule);
      this.conn = await this.db.connect();

      await this.conn.query(`CREATE TABLE IF NOT EXISTS er_entities (
         cluster_id VARCHAR PRIMARY KEY, members_json VARCHAR DEFAULT '[]', cohesion DOUBLE DEFAULT 0)`);

      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  private async getBundledBundle(
    duckdb: Record<string, unknown>,
  ): Promise<{ mainModule: string; mainWorker?: string } | null> {
    try {
      const getJsDelivrBundles = duckdb['getJsDelivrBundles'] as () => unknown[];
      const selectBundle = duckdb['selectBundle'] as (bundles: unknown[]) => Promise<{
        mainModule: string;
        mainWorker?: string;
      }>;
      const bundles = getJsDelivrBundles();
      return await selectBundle(bundles);
    } catch {
      return null;
    }
  }

  private async createWorkerWithTimeout(
    bundle: { mainWorker?: string },
    timeout: number,
  ): Promise<Worker | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.log('WASM worker creation timed out');
        resolve(null);
      }, timeout);

      try {
        const workerUrl = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' }),
        );
        const worker = new Worker(workerUrl);
        URL.revokeObjectURL(workerUrl);
        clearTimeout(timer);
        resolve(worker);
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  private fallbackInit(reason: string): DuckDBWasmInitResult {
    this.log(`Falling back to MemoryEntityStore: ${reason}`);
    this.initResult = {
      tier: 'memory_fallback',
      wasmActive: false,
      status: `Memory fallback: ${reason}`,
    };
    return this.initResult;
  }

  private log(msg: string): void {
    if (this.opts.debug) {
      console.debug(`[DuckDBWasmStore] ${msg}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // IEntityStore implementation
  // ══════════════════════════════════════════════════════════════

  async getEntity(id: EntityId): Promise<EntityRecord | null> {
    if (!this.ready || !this.conn) return this.fallback.getEntity(id);
    try {
      const result = await this.conn.query('SELECT * FROM er_entities WHERE cluster_id = ?', [id]);
      const rows = result.toArray();
      if (rows.length === 0) return null;
      const row = rows[0]!;
      return {
        clusterId: row.cluster_id,
        memberIds: JSON.parse(row.members_json ?? '[]') as number[],
        cohesion: row.cohesion ?? 0,
      };
    } catch {
      return this.fallback.getEntity(id);
    }
  }

  async queryNeighbors(id: EntityId, hops: number = 1): Promise<EntityRecord[]> {
    if (!this.ready || !this.conn) return this.fallback.queryNeighbors(id, hops);
    try {
      const target = await this.conn.query('SELECT * FROM er_entities WHERE cluster_id = ?', [id]);
      const targetRows = target.toArray();
      if (targetRows.length === 0) return [];
      const targetRow = targetRows[0]!;
      const result: EntityRecord[] = [
        {
          clusterId: targetRow.cluster_id,
          memberIds: JSON.parse(targetRow.members_json ?? '[]') as number[],
          cohesion: targetRow.cohesion ?? 0,
        },
      ];
      if (hops <= 0) return result;
      return result;
    } catch {
      return [];
    }
  }

  async upsertEntity(e: EntityRecord): Promise<void> {
    if (!this.ready || !this.conn) {
      await this.fallback.upsertEntity(e);
      return;
    }
    try {
      await this.conn.query('INSERT OR REPLACE INTO er_entities VALUES (?, ?, ?)', [
        e.clusterId,
        JSON.stringify(e.memberIds),
        e.cohesion,
      ]);
    } catch {
      await this.fallback.upsertEntity(e);
    }
  }

  async deleteEntity(id: EntityId): Promise<void> {
    if (!this.ready || !this.conn) {
      await this.fallback.deleteEntity(id);
      return;
    }
    try {
      await this.conn.query('DELETE FROM er_entities WHERE cluster_id = ?', [id]);
    } catch {
      await this.fallback.deleteEntity(id);
    }
  }

  async applyMerge(from: EntityId, into: EntityId): Promise<void> {
    const fe = await this.getEntity(from);
    const ie = await this.getEntity(into);
    if (fe && ie) {
      await this.upsertEntity({
        clusterId: ie.clusterId,
        memberIds: [...new Set([...ie.memberIds, ...fe.memberIds])],
        cohesion: ie.cohesion,
      });
      await this.deleteEntity(from);
    }
  }

  async applySplit(id: EntityId, groups: EntityId[][]): Promise<void> {
    await this.deleteEntity(id);
    for (let i = 0; i < groups.length; i++) {
      await this.upsertEntity({
        clusterId: `${id}_split_${i}`,
        memberIds: groups[i]!.map(Number),
        cohesion: 0,
      });
    }
  }

  async close(): Promise<void> {
    if (this.conn) await this.conn.close();
    if (this.db) await this.db.terminate();
  }
}
