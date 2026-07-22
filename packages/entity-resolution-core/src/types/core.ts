// Core type definitions for entity-resolution.
// These types form the foundation of the stateless computation engine.

/** Unique identifier for a record within a dataset. */
export type RecordId = number;

/** Unique identifier for an entity (cluster) across datasets. */
export type EntityId = string;

/** A raw record — any object with string-indexable fields. */
export type RawRecord = Record<string, unknown>;

/** Metadata describing a data field. */
export interface FieldMetadata {
  /** Field name as it appears in the data source. */
  readonly name: string;
  /** Detected semantic type (e.g., "email", "name", "date"). */
  readonly semanticType: string;
  /** Number of distinct values observed in sample. */
  readonly cardinality: number;
  /** Whether the field appears to contain numeric data. */
  readonly isNumeric: boolean;
}

/** A scored candidate pair produced by the matching phase. */
export interface ScoredPair {
  readonly leftId: RecordId;
  readonly rightId: RecordId;
  /** Aggregate similarity score in [0, 1]. */
  readonly score: number;
  /** Match probability from the Fellegi-Sunter model, if available. */
  readonly probability?: number;
}

/** A cluster of records representing one real-world entity. */
export interface Cluster {
  readonly clusterId: EntityId;
  readonly memberIds: RecordId[];
  /** Average pairwise similarity within the cluster. */
  readonly cohesion: number;
}

/** The complete result of an entity resolution run. */
export interface PipelineResult {
  readonly clusters: ReadonlyMap<EntityId, Cluster>;
  readonly scoredPairs: readonly ScoredPair[];
  readonly singletons: readonly RecordId[];
  readonly statistics: PipelineStatistics;
  readonly diagnostics: DiagnosticData;
}

/** Summary statistics for a pipeline run. */
export interface PipelineStatistics {
  readonly totalRecords: number;
  readonly totalClusters: number;
  readonly matchedRecords: number;
  readonly matchRate: number;
  readonly averageClusterSize: number;
  readonly maxClusterSize: number;
  readonly executionTimeMs: number;
}

/** Diagnostic data for model introspection. */
export interface DiagnosticData {
  /** Per-field m/u parameters from the Fellegi-Sunter model. */
  readonly muParameters: ReadonlyMap<string, FieldMuParams>;
  /** Match weight distribution across all candidate pairs. */
  readonly matchWeightDistribution: readonly MatchWeightBin[];
  /** Pairs that were blocked but scored below threshold. */
  readonly unlinkableCount: number;
}

/** m-probability and u-probability for a single field. */
export interface FieldMuParams {
  readonly mProbabilities: ReadonlyMap<string, number>;
  readonly uProbabilities: ReadonlyMap<string, number>;
}

/** A histogram bin for match weight distribution. */
export interface MatchWeightBin {
  readonly minWeight: number;
  readonly maxWeight: number;
  readonly count: number;
}
