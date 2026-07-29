// @agentix-e/entity-resolver-extract — Schema-driven entity extraction engine
//
// Extracts structured entities from unstructured text using a layered cascade:
//   Layer 1: Pattern Match        — free, <1ms, ~70% coverage
//   Layer 2: ONNX NER             — free, <20ms, ~20% coverage
//   Layer 3: LLM Fallback         — paid, <2s, ~10% coverage
//
// Design principle: "Pattern-First, LLM-Last"
// The cascade ensures 90% of extractions cost $0 while maintaining 100% coverage.

// TODO(I13): Implement PatternRegistry — schema-driven regex + dictionary patterns
// TODO(I13): Implement extract() — main entry point with layered cascade
// TODO(I13): Implement built-in type patterns (time, date, email, phone, url, number, boolean)
// TODO(I14): Implement CJK temporal expression parser
// TODO(I15): Implement context-aware extraction (intent-enhanced mode)
// TODO(I16): Implement GLiNER ONNX NER adapter
// TODO(I16): Implement LLM extraction fallback with Instructor-style validation loop

export interface ExtractionResult {
  /** The extracted field values, keyed by schema field name */
  values: Record<string, unknown>;
  /** Which layer produced each field */
  provenance: Record<string, 'pattern' | 'onnx' | 'llm'>;
  /** Per-field confidence scores [0, 1] */
  confidence: Record<string, number>;
  /** Input text after normalization */
  normalizedText: string;
}

export const extractVersion = '0.1.0';
