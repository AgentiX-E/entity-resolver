// @agentix-e/entity-resolution-core
// Stateless Entity Resolution computation engine.
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
  ALL_SCORERS,
  IMPLEMENTED_SCORER_COUNT,
} from './matching/scorers/js/scorers.js';

// Scorer Registry
export {
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
