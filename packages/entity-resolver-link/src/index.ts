// @agentix-e/entity-resolver-link — Schema-aware private KB entity linking
//
// Links extracted entities to a user-provided knowledge base using a hybrid approach:
//   Layer 1: Gazetteer Match  — exact and fuzzy lookup against entity catalogs
//   Layer 2: Embedding Search   — semantic similarity via vector embeddings
//   Layer 3: Schema-aware       — entity type constraints narrow candidate space
//
// Key distinction from Wikipedia/DbPedia linkers:
//   - Links to PRIVATE knowledge bases (customer lists, product catalogs, etc.)
//   - No Wikipedia dump needed, no GPU required
//   - Schema-aware: entity type filter reduces false positives
//
// Architecture: Gazetteer-first, Embedding-second, Schema-constrained.

// TODO(I17): Implement GazetteerEngine — exact + fuzzy match + vector search
// TODO(I17): Implement HybridLinker — ensemble with weighted voting
// TODO(I17): Implement SchemaConstraint — type-filtered candidate generation
// TODO(I17): Integrate usearch HNSW for vector search

export interface LinkResult {
  /** The best-matching entity ID from the knowledge base */
  entityId: string | null;
  /** Ranked candidate list (entityId → score, sorted descending) */
  candidates: Array<{ entityId: string; score: number }>;
  /** Match tier: 'exact' | 'fuzzy' | 'embedding' | 'none' */
  matchTier: 'exact' | 'fuzzy' | 'embedding' | 'none';
  /** Confidence score [0, 1] */
  confidence: number;
}

export const linkVersion = '0.1.0';
