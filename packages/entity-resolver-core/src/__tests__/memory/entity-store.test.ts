// Tests for MemoryEntityStore and MemoryConfigStore — in-memory reference implementations.

import { describe, it, expect } from 'vitest';
import { MemoryEntityStore } from '../../memory/entity-store.js';
import { MemoryConfigStore } from '../../memory/config-store.js';

describe('MemoryEntityStore', () => {
  describe('getEntity', () => {
    it('returns null for non-existent entity', async () => {
      const store = new MemoryEntityStore();
      const result = await store.getEntity('nonexistent');
      expect(result).toBeNull();
    });

    it('returns entity after upsert', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0.5 });
      const result = await store.getEntity('c1');
      expect(result).not.toBeNull();
      expect(result!.clusterId).toBe('c1');
      expect(result!.memberIds).toEqual([1]);
    });
  });

  describe('upsertEntity', () => {
    it('inserts new entity', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0.3 });
      const result = await store.getEntity('c1');
      expect(result!.clusterId).toBe('c1');
    });

    it('updates existing entity', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0.3 });
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1, 2], cohesion: 0.5 });
      const result = await store.getEntity('c1');
      expect(result!.memberIds).toEqual([1, 2]);
    });
  });

  describe('deleteEntity', () => {
    it('deletes existing entity', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0 });
      await store.deleteEntity('c1');
      const result = await store.getEntity('c1');
      expect(result).toBeNull();
    });

    it('does not throw when deleting non-existent entity', async () => {
      const store = new MemoryEntityStore();
      await expect(store.deleteEntity('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('queryNeighbors', () => {
    it('returns entity itself as neighbor', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0.5 });
      const neighbors = await store.queryNeighbors('c1', 1);
      expect(neighbors.length).toBe(1);
      expect(neighbors[0]!.clusterId).toBe('c1');
    });

    it('returns empty array for non-existent entity', async () => {
      const store = new MemoryEntityStore();
      const neighbors = await store.queryNeighbors('nonexistent');
      expect(neighbors).toEqual([]);
    });
  });

  describe('applyMerge', () => {
    it('merges two entities into one', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0.5 });
      await store.upsertEntity({ clusterId: 'c2', memberIds: [2], cohesion: 0.5 });
      await store.applyMerge('c2', 'c1');

      // c2 deleted, c1 has combined members
      const c2 = await store.getEntity('c2');
      expect(c2).toBeNull();

      const c1 = await store.getEntity('c1');
      expect(c1!.memberIds).toContain(1);
      expect(c1!.memberIds).toContain(2);
    });

    it('handles merge when from entity does not exist', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0 });
      await expect(store.applyMerge('nonexistent', 'c1')).resolves.toBeUndefined();
    });

    it('handles merge when into entity does not exist', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1], cohesion: 0 });
      await expect(store.applyMerge('c1', 'nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('applySplit', () => {
    it('splits entity into groups', async () => {
      const store = new MemoryEntityStore();
      await store.upsertEntity({ clusterId: 'c1', memberIds: [1, 2, 3, 4], cohesion: 0.5 });
      await store.applySplit('c1', [
        ['1', '2'],
        ['3', '4'],
      ]);

      // Original entity deleted
      const original = await store.getEntity('c1');
      expect(original).toBeNull();

      // Split entities created
      const s0 = await store.getEntity('c1_split_0');
      const s1 = await store.getEntity('c1_split_1');
      expect(s0).not.toBeNull();
      expect(s1).not.toBeNull();
      expect(s0!.memberIds).toEqual([1, 2]);
      expect(s1!.memberIds).toEqual([3, 4]);
    });

    it('handles split with empty groups', async () => {
      const store = new MemoryEntityStore();
      await expect(store.applySplit('nonexistent', [])).resolves.toBeUndefined();
    });
  });
});

// ══════════════════════════════════════════════════════
// MemoryConfigStore
// ══════════════════════════════════════════════════════

describe('MemoryConfigStore', () => {
  it('load returns null for non-existent config', async () => {
    const store = new MemoryConfigStore();
    expect(await store.load('missing')).toBeNull();
  });

  it('save and load roundtrip', async () => {
    const store = new MemoryConfigStore();
    const config = {
      blocking: { passes: [{ fields: ['name'], transforms: ['strip' as const] }] },
      comparisons: [],
      matchThreshold: 0.5,
    };
    await store.save('my-pipeline', config);
    const loaded = await store.load('my-pipeline');
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('my-pipeline');
    expect(loaded!.config.matchThreshold).toBe(0.5);
    expect(loaded!.createdAt).toBeTruthy();
    expect(loaded!.updatedAt).toBeTruthy();
  });

  it('list returns all config names', async () => {
    const store = new MemoryConfigStore();
    await store.save('config-a', { blocking: {}, comparisons: [], matchThreshold: 0.5 });
    await store.save('config-b', { blocking: {}, comparisons: [], matchThreshold: 0.7 });
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list).toContain('config-a');
    expect(list).toContain('config-b');
  });

  it('delete removes config', async () => {
    const store = new MemoryConfigStore();
    await store.save('temp', { blocking: {}, comparisons: [], matchThreshold: 0.5 });
    await store.delete('temp');
    expect(await store.load('temp')).toBeNull();
  });

  it('delete non-existent is idempotent', async () => {
    const store = new MemoryConfigStore();
    await expect(store.delete('nonexistent')).resolves.toBeUndefined();
  });

  it('save updates existing config maintains createdAt', async () => {
    const store = new MemoryConfigStore();
    await store.save('pipeline', { blocking: {}, comparisons: [], matchThreshold: 0.5 });
    const first = await store.load('pipeline');
    // Wait 1ms to ensure different updatedAt
    await new Promise((r) => setTimeout(r, 1));
    await store.save('pipeline', { blocking: {}, comparisons: [], matchThreshold: 0.8 });
    const second = await store.load('pipeline');
    expect(second!.createdAt).toBe(first!.createdAt);
    expect(second!.config.matchThreshold).toBe(0.8);
  });
});
