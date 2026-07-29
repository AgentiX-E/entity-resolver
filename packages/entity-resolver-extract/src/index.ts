// @agentix-e/entity-resolver-extract — Schema-driven entity extraction engine
//
// Extracts structured entities from unstructured text using a layered cascade:
//   Layer 1: Pattern Match        — free, <1ms, ~70% coverage (I13)
//   Layer 2: ONNX NER             — free, <20ms, ~20% coverage (I16)
//   Layer 3: LLM Fallback         — paid, <2s, ~10% coverage (I16)
//
// Design principle: "Pattern-First, LLM-Last"
// The cascade ensures 90% of extractions cost $0 while maintaining 100% coverage.

export {
  extract,
  extractAsync,
  PatternRegistry,
  registerBuiltins,
  extractPatterns,
  normalizeText,
  coerce,
  coerceAll,
} from './extractor.js';

export type { ExtractionResult, FieldDescriptor, ExtractOptions } from './extractor.js';

export type {
  PatternMatch,
  PatternMatcher,
  PatternRegistration,
} from './pattern/pattern-registry.js';

export type { FieldExtraction, PatternExtractionResult } from './pattern/pattern-extractor.js';

export { parseTemporal } from './temporal/parser.js';
export type { TemporalResult, ParseTemporalOptions } from './temporal/parser.js';

export {
  resolveIntent,
  registerIntent,
  lookupIntent,
  applyIntentContext,
  applyDefaults,
} from './context/intent-context.js';
export type {
  IntentDefinition,
  IntentField,
  IntentContextResult,
} from './context/intent-context.js';

export {
  inheritSlots,
  buildExtractionContext,
  detectModification,
  detectCancellation,
  detectCorrection,
} from './context/slot-inheritance.js';
export type { ExtractionContext, InheritResult } from './context/slot-inheritance.js';

export type { CoercionResult, CoercionTarget } from './normalization/type-coercion.js';

export { onnxExtract, isOnnxAvailable, resetOnnxState, getOnnxError } from './onnx/ner-adapter.js';
export type { OnnxExtractResult } from './onnx/ner-adapter.js';

export { llmExtract, resetLLMCircuitBreaker, getCircuitBreakerState } from './llm/llm-extractor.js';
export type { LLMExtractOptions, LLMExtractResult } from './llm/llm-extractor.js';

export const extractVersion = '0.1.0';
