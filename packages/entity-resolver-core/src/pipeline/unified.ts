/**
 * Unified Intelligent Entity Resolution Pipeline (U-Pipe)
 *
 * A dataset-agnostic, self-learning, extensible pipeline inspired by:
 *   - "Entity Resolution in Practice" (arXiv 2607.26298) — SOP-driven, teacher-student, verified merge
 *   - GoldenMatch — autoConfigure, ensemble scoring, blocking union
 *   - ComEM (COLING 2025) — LLM selecting over binary matching
 *   - MutualER (CIKM 2024) — jointly trained blocker + matcher
 *
 * Architecture:
 *   Stage 0: Discover — LLM analyzes dataset, auto-generates SOP
 *   Stage 1: Block    — Multi-strategy candidate pair generation
 *   Stage 2: Score    — Tournament of matchers (FS, ML, LLM)
 *   Stage 3: Learn    — Teacher-student distillation + self-improvement
 *   Stage 4: Cluster  — Verified merge (transitive closure safety)
 *
 * All stages are pluggable via interface contracts.
 * The pipeline auto-adapts to any dataset without manual configuration.
 */


// ═══════════════════════════════════════════════════════════════
// Stage 0: Discover — Auto-SOP Generation
// ═══════════════════════════════════════════════════════════════

/** A Standard Operating Procedure — domain-specific matching rules. */
export interface MatchingSOP {
  /** Version for audit trail. */
  readonly version: string;
  /** Domain label (auto-detected or user-specified). */
  readonly domain: string;
  /** Field importance hierarchy: critical > high > medium > low. */
  readonly fieldHierarchy: {
    readonly critical: readonly string[];
    readonly high: readonly string[];
    readonly medium: readonly string[];
    readonly low: readonly string[];
  };
  /** Per-field tolerance rules (abbreviation, typo, phonetic, reorder). */
  readonly tolerances: Readonly<Record<string, readonly string[]>>;
  /** Decision rules: when to match, review, or reject. */
  readonly decisionRules: {
    readonly match: string;
    readonly review: string;
    readonly nonMatch: string;
  };
  /** Estimated match density (0-1). */
  readonly estimatedDensity: number;
}

/** Result of field discovery. */
export interface DiscoveredSchema {
  readonly fields: readonly string[];
  readonly types: Readonly<Record<string, string>>;
  readonly sop: MatchingSOP;
}

// ═══════════════════════════════════════════════════════════════
// Stage 1: Block — Multi-Strategy Candidate Generation
// ═══════════════════════════════════════════════════════════════

/** A single blocking strategy. */
export interface BlockingStrategy {
  readonly name: string;
  readonly type: 'exact' | 'soundex' | 'token' | 'embedding' | 'llm' | 'composite';
  readonly fields: readonly string[];
  readonly transforms: readonly string[];
  readonly config?: Record<string, unknown>;
}

/** Blocking result with diagnostics. */
export interface UnifiedBlockingResult {
  readonly pairs: ReadonlyArray<{ readonly leftId: number; readonly rightId: number }>;
  readonly perStrategyPairs: Readonly<Record<string, number>>;
  readonly totalCandidatePairs: number;
  readonly reductionRatio: number;
  readonly recall: number;
}

// ═══════════════════════════════════════════════════════════════
// Stage 2: Score — Matcher Tournament
// ═══════════════════════════════════════════════════════════════

/** A scoring strategy in the tournament. */
export interface MatcherStrategy {
  readonly name: string;
  readonly type: 'fellegi_sunter' | 'lightgbm' | 'deep_learning' | 'llm' | 'ensemble';
  readonly train: (features: UnifiedScoredPair[], labels: number[]) => Promise<void>;
  readonly predict: (features: UnifiedScoredPair[]) => Promise<number[]>;
  readonly cost: 'low' | 'medium' | 'high';
}

/** A scored candidate pair. */
export interface UnifiedScoredPair {
  readonly leftId: number;
  readonly rightId: number;
  readonly score: number;
  readonly probability: number;
  /** Per-field similarity breakdown. */
  readonly fieldScores: Readonly<Record<string, number>>;
}

/** Tournament result — best matcher per dataset. */
export interface TournamentResult {
  readonly winner: MatcherStrategy;
  readonly scores: Readonly<Record<string, number>>;
  readonly diagnostic: string;
}

// ═══════════════════════════════════════════════════════════════
// Stage 3: Learn — Teacher-Student Distillation
// ═══════════════════════════════════════════════════════════════

/** LLM teacher labeling result. */
export interface TeacherLabels {
  readonly pairVerdicts: ReadonlyArray<{
    readonly leftId: number;
    readonly rightId: number;
    readonly verdict: 'match' | 'review' | 'non_match';
    readonly confidence: number;
    readonly evidence: string;
    readonly fieldScores: Readonly<Record<string, number>>;
  }>;
  readonly cost: number;
  readonly labeledCount: number;
}

/** Student matcher trained on teacher labels. */
export interface StudentMatcher {
  readonly name: string;
  readonly trained: boolean;
  readonly predictability: (pairs: UnifiedScoredPair[]) => Promise<number[]>;
  readonly costPerMillion: number;
}

// ═══════════════════════════════════════════════════════════════
// Stage 4: Cluster — Verified Merge
// ═══════════════════════════════════════════════════════════════

/** Cluster with safety metadata. */
export interface VerifiedCluster {
  readonly members: readonly number[];
  readonly centroid: Record<string, unknown>;
  readonly confidence: number;
  readonly verified: boolean;
}

/** Clustering result. */
export interface UnifiedUnifiedClusteringResult {
  readonly clusters: readonly VerifiedCluster[];
  readonly singletons: readonly number[];
  readonly mergeStats: {
    readonly attemptedMerges: number;
    readonly blockedMerges: number;
    readonly verifiedMerges: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// Unified Pipeline Interface
// ═══════════════════════════════════════════════════════════════

/** Configuration for the unified pipeline. */
export interface UnifiedPipelineConfig {
  /** Whether to auto-discover schema and generate SOP. */
  readonly autoDiscover?: boolean;
  /** Pre-defined SOP (skips auto-discovery). */
  readonly sop?: MatchingSOP;
  /** Blocking strategies (auto-selected if omitted). */
  readonly blockingStrategies?: readonly BlockingStrategy[];
  /** Matcher tournament participants (auto-selected if omitted). */
  readonly matchers?: readonly MatcherStrategy[];
  /** Whether to use LLM teacher for labeling. */
  readonly useTeacher?: boolean;
  /** LLM configuration. */
  readonly llm?: {
    readonly apiKey: string;
    readonly provider: string;
    readonly model?: string;
  };
  /** Whether to use verified merge (recommended for safety). */
  readonly verifiedMerge?: boolean;
  /** Match density estimate (auto-detected if omitted). */
  readonly estimatedDensity?: number;
}

/** Unified pipeline result. */
export interface UnifiedPipelineResult {
  readonly clusters: readonly VerifiedCluster[];
  readonly singletons: readonly number[];
  readonly metrics: {
    readonly totalRecords: number;
    readonly blockedPairs: number;
    readonly scoredPairs: number;
    readonly matchedRecords: number;
    readonly clusters: number;
  };
  readonly diagnostics: {
    readonly sop: MatchingSOP;
    readonly blockingCoverage: number;
    readonly tournament: TournamentResult;
    readonly precisionEstimate: number;
    readonly teacherCost?: number;
  };
  readonly auditLog: readonly AuditEvent[];
}

/** An immutable audit event for every pipeline decision. */
export interface AuditEvent {
  readonly timestamp: number;
  readonly stage: string;
  readonly action: string;
  readonly details: Record<string, unknown>;
}
