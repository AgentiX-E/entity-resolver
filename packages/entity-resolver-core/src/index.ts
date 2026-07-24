// @agentix-e/entity-resolver-core
// Stateless Entity Resolver computation engine.
// Pure functions — zero I/O, zero side effects.

// Types
export type {
  RecordId,
  EntityId,
  RawRecord,
  FieldMetadata,
  ScoredPair,
  Cluster,
  PipelineResult,
  PipelineStatistics,
  DiagnosticData,
  FieldMuParams,
  MatchWeightBin,
} from './types/core.js';

// Interfaces
export type { IScorer, ScorerFactory } from './interfaces/IScorer.js';
export type { IEntityStore, ICloseableStore, EntityRecord } from './interfaces/IEntityStore.js';
export type { IConfigStore, StoredConfig } from './interfaces/IConfigStore.js';
export type { ILogger, LogLevel, LogContext } from './interfaces/ILogger.js';
export { NoopLogger } from './interfaces/ILogger.js';
export type { IDataSource, ReadOptions } from './interfaces/IDataSource.js';

// Error Hierarchy
export {
  EntityResolverError,
  ValidationError,
  ConfigurationError,
  IOError,
  ParseError,
  ResolutionError,
  BlockingError,
  ScoringError,
  ClusteringError,
  EvaluationError,
  ConvergenceError,
  LLMError,
  AuthError,
  RateLimitError,
  InternalError,
  reconstructError,
  wrapError,
} from './errors/hierarchy.js';
export type { ErrorCode, ErrorContext } from './errors/hierarchy.js';

// Scorers
export {
  exactScorer,
  levenshteinScorer,
  damerauLevenshteinScorer,
  jaroScorer,
  jaroWinklerScorer,
  diceScorer,
  jaccardScorer,
  overlapScorer,
  lcsScorer,
  soundexScorer,
  doubleMetaphoneScorer,
  tokenSortScorer,
  tfidfCosineScorer,
  qgramTfIdfScorer,
  ensembleScorer,
  numericDiffScorer,
  dateDiffScorer,
  booleanMatchScorer,
  radialScorer,
  ALL_SCORERS,
  IMPLEMENTED_SCORER_COUNT,
} from './matching/scorers/js/scorers.js';

// Scorer Registry
export type { ScorerInitResult } from './matching/scorers/registry.js';
export {
  initScorers,
  getScorers,
  getScorer,
  scorerCount,
  resetScorerCache,
  validateScorerRegistry,
} from './matching/scorers/registry.js';

// Comparison System
export type { ComparisonLevel, ComparisonSpec, ComparisonVector } from './matching/comparison.js';

export {
  generateComparisonVectors,
  COMPARISON_LEVELS,
  nameComparisonSpec,
  emailComparisonSpec,
  dateComparisonSpec,
} from './matching/comparison.js';

// WASM Loader
export { tryLoadWasmScorers } from './matching/scorers/wasm/loader.js';

// Preprocessing
export {
  repairUnicode,
  normalize,
  normalizeEmail,
  normalizePhone,
  preprocessRecords,
} from './preprocessing/cleaner.js';

// Fellegi-Sunter Probability Model
export type { FSParameters } from './fellegi-sunter/parameters.js';
export {
  createDefaultParameters,
  extractComparisonKeys,
  cloneParametersMutable,
  freezeParameters,
  validateParameters,
} from './fellegi-sunter/parameters.js';

export type { EMOptions, EMResult } from './fellegi-sunter/em.js';
export { estimateParameters } from './fellegi-sunter/em.js';

export type { MatchWeightResult } from './fellegi-sunter/match-weight.js';
export {
  computeMatchWeight,
  computeAggregateMatchWeight,
  weightToProbability,
  probabilityToWeight,
  priorWeight,
  MATCH_WEIGHT_INTERPRETATION,
} from './fellegi-sunter/match-weight.js';

export type { TermFrequency } from './fellegi-sunter/tf-adjust.js';
export {
  buildTermFrequencies,
  computeTFAdjustment,
  adjustWeightByTF,
  TFAdjustmentLookup,
} from './fellegi-sunter/tf-adjust.js';

export type { CorrelationWarning, CorrelationReport } from './fellegi-sunter/field-independence.js';
export { analyzeFieldCorrelations } from './fellegi-sunter/field-independence.js';

// Model Serialization
export type { SerializedModel, DeserializedModel } from './fellegi-sunter/model-serialization.js';
export {
  MODEL_VERSION,
  serializeModel,
  serializeFSParamsToJSON,
  deserializeModel,
  deserializeFSParamsFromJSON,
} from './fellegi-sunter/model-serialization.js';

// Blocking
export type {
  CandidatePair,
  BlockingConfig,
  BlockingPass,
  BlockingTransform,
  BlockingResult,
} from './blocking/types.js';
export { computeReductionRatio, applyBlockingTransforms } from './blocking/types.js';
export { standardBlocking, blockOn, blockOnSoundex } from './blocking/standard.js';
export {
  tokenBlocking,
  sortedNeighborhood,
  multiPassBlocking,
  blockPurging,
  comparisonNeighborhoodPruning,
  metaBlocking,
} from './blocking/strategies.js';
// Blocking (pyJedAI extensions)
export type { SuffixArraysConfig, ExtendedSuffixArraysConfig, ExtendedQGramsConfig } from './blocking/strategies-pyjedai.js';
export {
  suffixArraysBlocking,
  extendedSuffixArraysBlocking,
  extendedQGramsBlocking,
} from './blocking/strategies-pyjedai.js';

export type { WeightingScheme, PruningMethod, MetaBlockingConfig } from './blocking/meta-blocking.js';
export { metaBlockingFull } from './blocking/meta-blocking.js';

// Blocking Analysis
export type { BlockingAnalysisResult } from './blocking/analyzer.js';
export {
  analyzeBlockingRule,
  recommendBlockingRules,
  verifyBlockingRecall,
} from './blocking/analyzer.js';

// Clustering
export type { ClusteringResult, ClusteringMetadata } from './clustering/algorithms.js';
export { connectedComponents, dbscanClustering, uniqueMapping } from './clustering/algorithms.js';

// Evaluation
export type { EvaluationMetrics } from './evaluation/metrics.js';
export { evaluateClustering } from './evaluation/metrics.js';

// Pipeline
export type { PipelineConfig, PipelineOptions } from './pipeline/runner.js';
export { runPipeline, runPipelineFromSource } from './pipeline/runner.js';

// Benchmarks
export type { BenchmarkDataset, BenchmarkResult } from './benchmarks/datasets.js';
export {
  loadFebrl,
  loadDblpAcm,
  loadAbtBuy,
  loadAmazonGoogle,
  loadWdcProducts,
  loadWdcOffers,
  loadItunesAmazon,
  loadCora,
  loadAllBenchmarks,
} from './benchmarks/datasets.js';
export { runBenchmark, runAllBenchmarks, formatBenchmarkReport } from './benchmarks/runner.js';

// Auto-Config
export type { SemanticType, DetectedField, AutoConfigResult } from './auto-config/detector.js';
export { detectFields, autoConfigure } from './auto-config/detector.js';

// Active Learning
export type {
  LabeledPair,
  ActiveLearningSession,
  LogisticClassifier,
} from './active-learning/learner.js';
export {
  selectUncertainPairs,
  selectDiverseUncertainPairs,
  trainLogisticClassifier,
  predictClassifier,
  createSession,
  nextLabelingBatch,
  applyLabels,
  simulateLabeling,
  detectLabelContradictions,
} from './active-learning/learner.js';

// Incremental Update
export { incrementalAdd, incrementalDelete, incrementalModify } from './pipeline/incremental.js';

// Record Linking & Gazetteer
export type { GazetteerConfig, RecordLinkConfig } from './pipeline/linking.js';
export { gazetteerMatch, linkRecords } from './pipeline/linking.js';

// Memory reference implementations
export { MemoryEntityStore } from './memory/entity-store.js';
export { MemoryConfigStore } from './memory/config-store.js';

// PPRL
export type { PPRLConfig } from './pprl/bloom.js';
export {
  BloomFilter,
  encodePPRL,
  encodePPRLAsync,
  matchPPRL,
  matchPPRLAsync,
  sha256Async,
} from './pprl/bloom.js';

// LLM Scorer
export type { LLMScorerConfig, LLMScorerResult } from './llm/scorer.js';
export { scoreWithLLM } from './llm/scorer.js';

// Golden Record Survivorship
export type {
  SurvivorStrategy,
  FieldSurvivorRule,
  GoldenRecordConfig,
  GoldenRecordResult,
} from './golden-record.js';
export { buildGoldenRecord } from './golden-record.js';

// Utilities
export type { MemoryGuardConfig, MemorySnapshot } from './utils/memory-guard.js';
export { checkMemory, isMemoryHigh, estimateBlockingMemory } from './utils/memory-guard.js';
