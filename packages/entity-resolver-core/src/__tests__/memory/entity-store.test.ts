// Tests for MemoryEntityStore — in-memory reference implementation.

import { describe, it, expect } from 'vitest';
import { MemoryEntityStore } from '../../memory/entity-store.js';

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
        ['1', '2'] as any,
        ['3', '4'] as any,
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
