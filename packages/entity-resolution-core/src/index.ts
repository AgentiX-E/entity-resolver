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
