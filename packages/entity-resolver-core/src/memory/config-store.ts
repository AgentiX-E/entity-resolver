// MemoryConfigStore — pure JS Map-based reference implementation of IConfigStore.
// Zero dependencies. Serves as the default config store for testing and development.

import type { IConfigStore, StoredConfig } from '../interfaces/IConfigStore.js';
import type { PipelineConfig } from '../pipeline/runner.js';

export class MemoryConfigStore implements IConfigStore {
  private configs = new Map<
    string,
    { config: PipelineConfig; createdAt: string; updatedAt: string }
  >();

  async load(name: string): Promise<StoredConfig | null> {
    const entry = this.configs.get(name);
    if (!entry) return null;
    return {
      name,
      config: entry.config,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  async save(name: string, config: PipelineConfig): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.configs.get(name);
    this.configs.set(name, {
      config,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async list(): Promise<string[]> {
    return Array.from(this.configs.keys());
  }

  async delete(name: string): Promise<void> {
    this.configs.delete(name);
  }
}
