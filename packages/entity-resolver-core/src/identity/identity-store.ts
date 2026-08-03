/**
 * Identity Graph — durable entity identity layer with provenance (I40).
 *
 * Inspired by GoldenMatch's identity graph architecture:
 *   - UUIDv7 time-ordered entity IDs
 *   - Evidence edges with actor/trust provenance
 *   - Identity event log for complete audit trail
 *   - Deterministic record IDs
 *   - Merge conflict carry-forward
 *
 * Design: the IdentityStore is an in-memory implementation that can be
 * backed by any persistence layer (SQLite, Postgres, etc.) via the
 * IIdentityStore interface.
 */

// ═══════════════════════════════════════════════════════════════
// UUIDv7 — time-ordered, globally unique entity IDs
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a UUIDv7 (time-ordered UUID).
 *
 * Layout (128 bits):
 *   [48 bits: unix timestamp ms][4 bits: version 7]
 *   [12 bits: random_a][2 bits: variant 10][62 bits: random_b]
 *
 * Properties:
 *   - Globally unique (122 bits of randomness)
 *   - Time-ordered by millisecond timestamp in high bits
 *   - Sortable — suitable for B-tree indexes
 *   - RFC 9562 compliant
 */
export function generateUUIDv7(): string {
  const ts = BigInt(Date.now()) & 0xffffffffffffn;
  const randA = cryptoRandomBits(12);
  const randB = cryptoRandomBits(62);

  // Layout: timestamp(48) | version(4) | rand_a(12) | variant(2) | rand_b(62)
  const hi = (ts << 16n) | (0x7000n) | BigInt(randA);
  const lo = (0x8000000000000000n) | BigInt(randB);

  const hex = (hi << 64n) | lo;
  return hex.toString(16).padStart(32, '0')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

/** Cryptographically secure random bits (0 to 2^nbits - 1). */
function cryptoRandomBits(nbits: number): number {
  const bytes = Math.ceil(nbits / 8);
  const buf = new Uint8Array(bytes);
  // Use crypto.getRandomValues in browser, or crypto.randomBytes in Node
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    // Fallback: Math.random (acceptable for identity graph IDs, not cryptographic)
    for (let i = 0; i < bytes; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = 0;
  for (let i = 0; i < bytes; i++) {
    result = (result << 8) | buf[i]!;
  }
  return result & ((1 << nbits) - 1);
}

// ═══════════════════════════════════════════════════════════════
// Core identity types
// ═══════════════════════════════════════════════════════════════

/** Status of an entity in the identity graph. */
export type EntityStatus =
  | 'active'
  | 'merged_into'
  | 'split_from'
  | 'retired';

/** An entity (person, organization, etc.) in the identity graph. */
export interface IdentityNode {
  /** UUIDv7 identifier — stable across runs. */
  readonly entityId: string;
  /** Current status. */
  readonly status: EntityStatus;
  /** If merged, points to the surviving entity. */
  readonly mergedInto?: string;
  /** Golden record — canonical representation of this entity. */
  readonly goldenRecord: Record<string, unknown>;
  /** Confidence score [0, 1] for entity resolution quality. */
  readonly confidence: number;
  /** Creation timestamp (milliseconds since epoch). */
  readonly createdAt: number;
  /** Last modification timestamp. */
  readonly updatedAt: number;
}

/** A raw input record linked to an entity. */
export interface SourceRecord {
  /** Deterministic record ID: "{source}:{natural_key}" or "{source}:h1:{hash}". */
  readonly recordId: string;
  /** The entity this record belongs to. */
  readonly entityId: string;
  /** Source system identifier. */
  readonly source: string;
  /** Original record payload. */
  readonly payload: Record<string, unknown>;
  /** Content hash for deduplication. */
  readonly contentHash: string;
}

/** An evidence edge connecting two records. */
export interface EvidenceEdge {
  /** Edge ID (UUIDv7). */
  readonly edgeId: string;
  /** Source record ID. */
  readonly sourceRecordId: string;
  /** Target record ID. */
  readonly targetRecordId: string;
  /** Edge kind: SAME_AS or CONFLICTS_WITH. */
  readonly kind: 'same_as' | 'conflicts_with';
  /** Per-field match scores for explainability. */
  readonly fieldScores: Readonly<Record<string, number>>;
  /** Actor that created this edge (system, user, agent). */
  readonly actor: string;
  /** Trust level (0-1) assigned to the actor. */
  readonly trust: number;
  /** Creation timestamp. */
  readonly createdAt: number;
}

/** Type of identity event for audit trail. */
export type EventKind =
  | 'entity_created'
  | 'record_absorbed'
  | 'entities_merged'
  | 'entity_split'
  | 'entity_retired'
  | 'entity_promoted';

/** Authority level for an event claim. */
export type ClaimType = 'observation' | 'inference' | 'verified' | 'directive';

/** An immutable event in the identity audit trail. */
export interface IdentityEvent {
  /** Event ID (UUIDv7). */
  readonly eventId: string;
  /** Entity ID this event pertains to. */
  readonly entityId: string;
  /** Event kind. */
  readonly kind: EventKind;
  /** Actor that caused this event. */
  readonly actor: string;
  /** Trust level of the actor. */
  readonly trust: number;
  /** Claim authority level. */
  readonly claimType: ClaimType;
  /** Reference to evidence that caused this event. */
  readonly evidenceRef?: string;
  /** Previous claim ID for lifecycle chain verification. */
  readonly previousClaimId?: string;
  /** Event payload (type-specific data). */
  readonly payload: Record<string, unknown>;
  /** Creation timestamp. */
  readonly createdAt: number;
  /** Hash of the event for tamper-evidence. */
  readonly eventHash: string;
}

// ═══════════════════════════════════════════════════════════════
// Deterministic record IDs
// ═══════════════════════════════════════════════════════════════

/**
 * Build a deterministic record ID from source and key.
 *
 * Format: "{source}:{natural_key}" when natural key is available,
 * or "{source}:h1:{content_hash}" for content-based deduplication.
 */
export function buildRecordId(source: string, naturalKey?: string, contentHash?: string): string {
  if (naturalKey) {
    return `${source}:${naturalKey}`;
  }
  if (contentHash) {
    return `${source}:h1:${contentHash}`;
  }
  throw new Error('Either naturalKey or contentHash is required for record ID');
}

/**
 * Compute a simple content hash for a record payload.
 * Uses FNV-1a hash — not cryptographic, but sufficient for
 * content-based deduplication in entity resolution.
 */
export function computeContentHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ═══════════════════════════════════════════════════════════════
// IdentityStore — in-memory implementation
// ═══════════════════════════════════════════════════════════════

/**
 * In-memory identity store with event log and provenance.
 *
 * Thread-safe: all mutations are synchronous and produce events.
 * Replayable: events can be re-applied to reconstruct state.
 */
export class IdentityStore {
  private readonly entities = new Map<string, IdentityNode>();
  private readonly records = new Map<string, SourceRecord>();
  private readonly edges = new Map<string, EvidenceEdge>();
  private readonly events: IdentityEvent[] = [];
  private readonly recordsByEntity = new Map<string, Set<string>>();

  // ═══════════════════════════════════════════════════════════
  // Entity lifecycle
  // ═══════════════════════════════════════════════════════════

  /** Create a new entity from a golden record. */
  createEntity(
    goldenRecord: Record<string, unknown>,
    confidence: number,
    actor = 'system',
    trust = 1.0,
  ): IdentityNode {
    const entityId = generateUUIDv7();
    const now = Date.now();

    const node: IdentityNode = {
      entityId,
      status: 'active',
      goldenRecord,
      confidence,
      createdAt: now,
      updatedAt: now,
    };

    this.entities.set(entityId, node);
    this.emitEvent({
      entityId,
      kind: 'entity_created',
      actor,
      trust,
      claimType: 'inference',
      payload: { goldenRecord, confidence },
    });

    return node;
  }

  /** Absorb a source record into an existing entity. */
  absorbRecord(
    entityId: string,
    source: string,
    payload: Record<string, unknown>,
    naturalKey?: string,
    actor = 'system',
    trust = 1.0,
  ): SourceRecord {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);
    if (entity.status !== 'active') {
      throw new Error(`Cannot absorb into ${entity.status} entity ${entityId}`);
    }

    const contentHash = computeContentHash(payload);
    const recordId = buildRecordId(source, naturalKey, contentHash);

    // Check for existing record (idempotent)
    const existing = this.records.get(recordId);
    if (existing) return existing;

    const record: SourceRecord = {
      recordId,
      entityId,
      source,
      payload,
      contentHash,
    };

    this.records.set(recordId, record);

    // Index by entity
    const entityRecords = this.recordsByEntity.get(entityId) ?? new Set();
    entityRecords.add(recordId);
    this.recordsByEntity.set(entityId, entityRecords);

    // Update entity timestamp
    (entity as any).updatedAt = Date.now();

    this.emitEvent({
      entityId,
      kind: 'record_absorbed',
      actor,
      trust,
      claimType: 'observation',
      payload: { recordId, source, contentHash },
    });

    return record;
  }

  /** Add an evidence edge between two records. */
  addEdge(
    sourceRecordId: string,
    targetRecordId: string,
    kind: 'same_as' | 'conflicts_with',
    fieldScores: Record<string, number>,
    actor = 'system',
    trust = 1.0,
  ): EvidenceEdge {
    const edgeId = generateUUIDv7();

    const edge: EvidenceEdge = {
      edgeId,
      sourceRecordId,
      targetRecordId,
      kind,
      fieldScores,
      actor,
      trust,
      createdAt: Date.now(),
    };

    this.edges.set(edgeId, edge);
    return edge;
  }

  /** Merge multiple entities into a single surviving entity. */
  mergeEntities(
    survivorId: string,
    absorbedIds: readonly string[],
    actor = 'system',
    trust = 1.0,
  ): IdentityNode {
    const survivor = this.entities.get(survivorId);
    if (!survivor) throw new Error(`Survivor entity ${survivorId} not found`);

    for (const absorbedId of absorbedIds) {
      const absorbed = this.entities.get(absorbedId);
      if (!absorbed) throw new Error(`Absorbed entity ${absorbedId} not found`);

      // Mark as merged
      (absorbed as any).status = 'merged_into';
      (absorbed as any).mergedInto = survivorId;
      (absorbed as any).updatedAt = Date.now();

      // Save absorbed records BEFORE reassignment for carry-forward
      const absorbedRecords = this.recordsByEntity.get(absorbedId);

      // Reassign records to survivor
      if (absorbedRecords) {
        const survivorRecords = this.recordsByEntity.get(survivorId) ?? new Set();
        for (const rid of absorbedRecords) {
          const record = this.records.get(rid);
          if (record) {
            (record as any).entityId = survivorId;
            survivorRecords.add(rid);
          }
        }
        this.recordsByEntity.set(survivorId, survivorRecords);
        this.recordsByEntity.delete(absorbedId);
      }

      // Carry forward conflicts_with edges from absorbed entity's records
      if (absorbedRecords) {
        const carryEdges: Array<{
          targetRecordId: string;
          fieldScores: Record<string, number>;
        }> = [];
        for (const absorbedRid of absorbedRecords) {
          for (const [, edge] of this.edges) {
            if (edge.sourceRecordId === absorbedRid && edge.kind === 'conflicts_with') {
              carryEdges.push({
                targetRecordId: edge.targetRecordId,
                fieldScores: { ...edge.fieldScores },
              });
            }
          }
        }
        // Add carry-forward edges AFTER iteration (prevents infinite loop)
        for (const ce of carryEdges) {
          // Re-emit on the absorbed record itself (which now belongs to survivor)
          this.addEdge(
            ce.targetRecordId,
            ce.targetRecordId,
            'conflicts_with',
            ce.fieldScores,
            actor,
            trust,
          );
        }
      }

      this.emitEvent({
        entityId: absorbedId,
        kind: 'entities_merged',
        actor,
        trust,
        claimType: 'inference',
        evidenceRef: `merge abs ${absorbedId} into ${survivorId}`,
        payload: { survivorId, absorbedId },
      });
    }

    // Update survivor timestamp
    (survivor as any).updatedAt = Date.now();
    return survivor;
  }

  /** Split an entity into multiple independent entities. */
  splitEntity(
    entityId: string,
    memberGroups: ReadonlyArray<readonly string[]>,
    actor = 'system',
    trust = 1.0,
  ): IdentityNode[] {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);

    // Mark original as split
    (entity as any).status = 'split_from';
    (entity as any).updatedAt = Date.now();

    const newEntities: IdentityNode[] = [];

    for (const recordIds of memberGroups) {
      // Create new entity inheriting golden record fields
      const newEntity = this.createEntity(
        { ...entity.goldenRecord, _split_from: entityId },
        entity.confidence * 0.8, // Reduced confidence after split
        actor,
        trust,
      );

      // Reassign records
      for (const rid of recordIds) {
        const record = this.records.get(rid);
        if (record) {
          (record as any).entityId = newEntity.entityId;
          const entityRecords = this.recordsByEntity.get(newEntity.entityId) ?? new Set();
          entityRecords.add(rid);
          this.recordsByEntity.set(newEntity.entityId, entityRecords);
        }
      }

      newEntities.push(newEntity);
    }

    this.emitEvent({
      entityId,
      kind: 'entity_split',
      actor,
      trust,
      claimType: 'directive',
      payload: { newEntityIds: newEntities.map((e) => e.entityId), groupSizes: memberGroups.map((g) => g.length) },
    });

    return newEntities;
  }

  /** Retire an entity (mark as no longer active). */
  retireEntity(
    entityId: string,
    actor = 'system',
    trust = 1.0,
  ): IdentityNode {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);

    (entity as any).status = 'retired';
    (entity as any).updatedAt = Date.now();

    this.emitEvent({
      entityId,
      kind: 'entity_retired',
      actor,
      trust,
      claimType: 'directive',
      payload: {},
    });

    return entity;
  }

  // ═══════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════

  /** Get an entity by ID. */
  getEntity(entityId: string): IdentityNode | undefined {
    return this.entities.get(entityId);
  }

  /** Get all records for an entity. */
  getEntityRecords(entityId: string): SourceRecord[] {
    const ids = this.recordsByEntity.get(entityId);
    if (!ids) return [];
    return [...ids].map((id) => this.records.get(id)!).filter(Boolean);
  }

  /** Get all events for an entity (audit trail). */
  getEntityEvents(entityId: string): IdentityEvent[] {
    return this.events.filter((e) => e.entityId === entityId);
  }

  /** Get the complete event log. */
  getEventLog(): readonly IdentityEvent[] {
    return this.events;
  }

  /** Get all active entities. */
  getActiveEntities(): IdentityNode[] {
    return [...this.entities.values()].filter((e) => e.status === 'active');
  }

  /** Total entity count. */
  get entityCount(): number {
    return this.entities.size;
  }

  /** Total record count. */
  get recordCount(): number {
    return this.records.size;
  }

  /** Total edge count. */
  get edgeCount(): number {
    return this.edges.size;
  }

  /** Total event count. */
  get eventCount(): number {
    return this.events.length;
  }

  // ═══════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════

  private emitEvent(partial: {
    entityId: string;
    kind: EventKind;
    actor: string;
    trust: number;
    claimType: ClaimType;
    evidenceRef?: string;
    previousClaimId?: string;
    payload: Record<string, unknown>;
  }): void {
    const eventId = generateUUIDv7();
    const createdAt = Date.now();

    // Hash the event for tamper evidence
    const hashInput = JSON.stringify({
      eventId,
      ...partial,
      createdAt,
    });
    const eventHash = computeContentHash({ _event: hashInput });

    const event: IdentityEvent = {
      eventId,
      ...partial,
      createdAt,
      eventHash,
    };

    this.events.push(event);
  }
}
