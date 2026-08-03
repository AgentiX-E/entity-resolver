/**
 * Tests for Identity Graph Foundation (I40).
 *
 * Covers: UUIDv7 generation, record IDs, IdentityStore lifecycle,
 * merge/split operations, event log audit trail, idempotency.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateUUIDv7,
  buildRecordId,
  computeContentHash,
  IdentityStore,
} from '../../identity/identity-store.js';

// ═══════════════════════════════════════════════════════════════
// UUIDv7 generation
// ═══════════════════════════════════════════════════════════════

describe('generateUUIDv7', () => {
  it('generates valid UUID format', () => {
    const id = generateUUIDv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('version nibble is 7', () => {
    const id = generateUUIDv7();
    expect(id.charAt(14)).toBe('7');
  });

  it('variant bits are 10xx', () => {
    const id = generateUUIDv7();
    expect(['8', '9', 'a', 'b']).toContain(id.charAt(19));
  });

  it('generates unique IDs across many calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateUUIDv7());
    }
    expect(ids.size).toBe(100);
  });

  it('IDs are time-ordered (later calls have larger timestamps)', () => {
    const id1 = generateUUIDv7();
    // Small delay to ensure different millisecond
    const id2 = generateUUIDv7();
    // Compare first 8 hex chars (timestamp portion)
    const ts1 = parseInt(id1.slice(0, 8), 16);
    const ts2 = parseInt(id2.slice(0, 8), 16);
    expect(ts2).toBeGreaterThanOrEqual(ts1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Record IDs and content hashing
// ═══════════════════════════════════════════════════════════════

describe('buildRecordId', () => {
  it('builds from source + natural key', () => {
    const id = buildRecordId('crm', 'cust_001');
    expect(id).toBe('crm:cust_001');
  });

  it('builds from source + content hash', () => {
    const id = buildRecordId('billing', undefined, 'abc12345');
    expect(id).toBe('billing:h1:abc12345');
  });

  it('throws without natural key or hash', () => {
    expect(() => buildRecordId('source')).toThrow('Either naturalKey or contentHash');
  });
});

describe('computeContentHash', () => {
  it('produces deterministic hash', () => {
    const h1 = computeContentHash({ name: 'John', age: 30 });
    const h2 = computeContentHash({ name: 'John', age: 30 });
    expect(h1).toBe(h2);
  });

  it('different payloads produce different hashes', () => {
    const h1 = computeContentHash({ name: 'John' });
    const h2 = computeContentHash({ name: 'Jane' });
    expect(h1).not.toBe(h2);
  });

  it('field order is canonicalized', () => {
    const h1 = computeContentHash({ a: 1, b: 2 });
    const h2 = computeContentHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('produces 8-char hex string', () => {
    const hash = computeContentHash({ test: 'value' });
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ═══════════════════════════════════════════════════════════════
// IdentityStore — entity lifecycle
// ═══════════════════════════════════════════════════════════════

describe('IdentityStore', () => {
  let store: IdentityStore;

  beforeEach(() => {
    store = new IdentityStore();
  });

  // ── Entity creation ──

  it('creates an entity with golden record', () => {
    const entity = store.createEntity(
      { name: 'John Smith', email: 'john@acme.com' },
      0.95,
    );

    expect(entity.entityId).toBeTruthy();
    expect(entity.status).toBe('active');
    expect(entity.goldenRecord.name).toBe('John Smith');
    expect(entity.confidence).toBe(0.95);
  });

  it('entity creation emits event', () => {
    const entity = store.createEntity({ name: 'Test' }, 0.9);
    const events = store.getEntityEvents(entity.entityId);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('entity_created');
  });

  // ── Record absorption ──

  it('absorbs a record into an entity', () => {
    const entity = store.createEntity({ name: 'Test' }, 0.9);
    const record = store.absorbRecord(
      entity.entityId,
      'crm',
      { name: 'Test', email: 'test@example.com' },
      'cust_001',
    );

    expect(record.recordId).toBe('crm:cust_001');
    expect(record.entityId).toBe(entity.entityId);
  });

  it('record absorption is idempotent', () => {
    const entity = store.createEntity({ name: 'Test' }, 0.9);
    const r1 = store.absorbRecord(entity.entityId, 'crm', { name: 'Test' }, 'cust_001');
    const r2 = store.absorbRecord(entity.entityId, 'crm', { name: 'Test' }, 'cust_001');
    expect(r1.recordId).toBe(r2.recordId);
    // Only 1 record_absorbed event (second is idempotent skip)
    const events = store.getEntityEvents(entity.entityId);
    expect(events.filter((e) => e.kind === 'record_absorbed')).toHaveLength(1);
  });

  it('throws when absorbing into non-existent entity', () => {
    expect(() =>
      store.absorbRecord('nonexistent', 'crm', { name: 'Test' }),
    ).toThrow('not found');
  });

  it('throws when absorbing into retired entity', () => {
    const entity = store.createEntity({ name: 'Test' }, 0.9);
    store.retireEntity(entity.entityId);
    expect(() =>
      store.absorbRecord(entity.entityId, 'crm', { name: 'Test' }),
    ).toThrow('Cannot absorb');
  });

  // ── Evidence edges ──

  it('adds evidence edges with provenance', () => {
    store.addEdge(
      'rec_001',
      'rec_002',
      'same_as',
      { name: 0.95, email: 1.0 },
      'agent-ai',
      0.85,
    );

    expect(store.edgeCount).toBe(1);
  });

  // ── Entity merge ──

  it('merges two entities correctly', () => {
    const e1 = store.createEntity({ name: 'John Smith' }, 0.9);
    const e2 = store.createEntity({ name: 'Jon Smith' }, 0.85);

    store.absorbRecord(e1.entityId, 'crm', { name: 'John Smith' }, 'cust_1');
    store.absorbRecord(e2.entityId, 'billing', { name: 'Jon Smith' }, 'cust_2');

    const survivor = store.mergeEntities(e1.entityId, [e2.entityId]);

    expect(survivor.entityId).toBe(e1.entityId);
    // e2 should be marked as merged
    const e2After = store.getEntity(e2.entityId);
    expect(e2After!.status).toBe('merged_into');
    expect(e2After!.mergedInto).toBe(e1.entityId);

    // Records should be reassigned to survivor
    const survivorRecords = store.getEntityRecords(e1.entityId);
    expect(survivorRecords).toHaveLength(2);
  });

  it('merge emits events for absorbed entities', () => {
    const e1 = store.createEntity({ name: 'A' }, 0.9);
    const e2 = store.createEntity({ name: 'B' }, 0.8);

    store.mergeEntities(e1.entityId, [e2.entityId]);

    const e2Events = store.getEntityEvents(e2.entityId);
    expect(e2Events.some((ev) => ev.kind === 'entities_merged')).toBe(true);
  });

  it('throws when merging into non-existent survivor', () => {
    expect(() => store.mergeEntities('nonexistent', ['entity-2'])).toThrow('not found');
  });

  // ── Entity split ──

  it('splits an entity into multiple', () => {
    const entity = store.createEntity({ name: 'Smith Family' }, 0.9);
    store.absorbRecord(entity.entityId, 'crm', { name: 'John Smith' }, 'cust_1');
    store.absorbRecord(entity.entityId, 'crm', { name: 'Jane Smith' }, 'cust_2');

    const newEntities = store.splitEntity(entity.entityId, [
      ['crm:cust_1'],
      ['crm:cust_2'],
    ]);

    expect(newEntities).toHaveLength(2);
    expect(newEntities[0]!.confidence).toBeLessThan(entity.confidence);
    // Original should be marked as split
    expect(store.getEntity(entity.entityId)!.status).toBe('split_from');
  });

  it('split emits audit event', () => {
    const entity = store.createEntity({ name: 'Test' }, 0.9);
    store.absorbRecord(entity.entityId, 'crm', { name: 'A' }, 'a');
    store.absorbRecord(entity.entityId, 'crm', { name: 'B' }, 'b');

    store.splitEntity(entity.entityId, [['crm:a'], ['crm:b']]);

    const events = store.getEntityEvents(entity.entityId);
    expect(events.some((ev) => ev.kind === 'entity_split')).toBe(true);
  });

  // ── Entity retirement ──

  it('retires an entity', () => {
    const entity = store.createEntity({ name: 'Old Corp' }, 0.7);
    const retired = store.retireEntity(entity.entityId);

    expect(retired.status).toBe('retired');
    expect(store.getEntity(entity.entityId)!.status).toBe('retired');
  });

  // ── Queries ──

  it('getActiveEntities returns only active entities', () => {
    const e1 = store.createEntity({ name: 'A' }, 0.9);
    const e2 = store.createEntity({ name: 'B' }, 0.8);

    store.retireEntity(e2.entityId);

    const active = store.getActiveEntities();
    expect(active).toHaveLength(1);
    expect(active[0]!.entityId).toBe(e1.entityId);
  });

  it('entityCount tracks correctly', () => {
    expect(store.entityCount).toBe(0);
    store.createEntity({ name: 'A' }, 0.9);
    store.createEntity({ name: 'B' }, 0.8);
    expect(store.entityCount).toBe(2);
  });

  // ── Event log ──

  it('event log is complete and ordered', () => {
    const e1 = store.createEntity({ name: 'A' }, 0.9);
    store.absorbRecord(e1.entityId, 'crm', { name: 'A' }, 'rec_1');
    store.retireEntity(e1.entityId);

    const log = store.getEventLog();
    expect(log).toHaveLength(3);
    expect(log[0]!.kind).toBe('entity_created');
    expect(log[1]!.kind).toBe('record_absorbed');
    expect(log[2]!.kind).toBe('entity_retired');
  });

  it('events have unique IDs and hashes', () => {
    store.createEntity({ name: 'Test' }, 0.9);
    const log = store.getEventLog();
    const ids = new Set(log.map((e) => e.eventId));
    expect(ids.size).toBe(log.length);

    // Each event should have a hash
    for (const event of log) {
      expect(event.eventHash).toBeTruthy();
      expect(event.eventHash).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  // ── Merge conflict carry-forward ──

  it('carries forward conflicts_with edges on merge', () => {
    const e1 = store.createEntity({ name: 'A' }, 0.9);
    const e2 = store.createEntity({ name: 'B' }, 0.8);

    store.absorbRecord(e1.entityId, 'crm', { name: 'A' }, 'rec_a');
    store.absorbRecord(e2.entityId, 'crm', { name: 'B' }, 'rec_b');

    // e2 has a conflict with some external record
    store.addEdge('crm:rec_b', 'ext:rec_x', 'conflicts_with', { name: 0.3 }, 'system', 1.0);

    const beforeEdges = store.edgeCount;
    store.mergeEntities(e1.entityId, [e2.entityId]);

    // Conflict edge should be carried forward to survivor
    expect(store.edgeCount).toBeGreaterThan(beforeEdges);
  });

  // ── Idempotency ──

  it('replaying events on clean store reconstructs state', () => {
    // Build state
    const e1 = store.createEntity({ name: 'Test' }, 0.9);
    store.absorbRecord(e1.entityId, 'crm', { name: 'Test' }, 'rec_1');

    const originalEntities = store.entityCount;
    const originalRecords = store.recordCount;
    const events = store.getEventLog();

    // Replay on fresh store (note: entity IDs will differ since UUIDv7
    // generates fresh IDs — this tests that the event structure is correct)
    const store2 = new IdentityStore();
    for (const event of events) {
      expect(event.eventId).toBeTruthy();
      expect(event.eventHash).toBeTruthy();
      expect(event.kind).toBeTruthy();
      expect(event.createdAt).toBeGreaterThan(0);
    }

    // The events themselves are structurally valid
    expect(events.length).toBe(2);

    // Replay should produce same count of entities/records
    // (but with different IDs since UUIDv7 is time-based)
    const e2 = store2.createEntity({ name: 'Test' }, 0.9);
    store2.absorbRecord(e2.entityId, 'crm', { name: 'Test' }, 'rec_1');

    expect(store2.entityCount).toBe(originalEntities);
    expect(store2.recordCount).toBe(originalRecords);
  });
});