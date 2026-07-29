/**
 * ONNX NER Adapter — Zero-shot entity extraction via ONNX models.
 *
 * This is Layer 2 of the extraction cascade (Pattern → ONNX → LLM).
 *
 * Current status: STUB — real implementation requires:
 *   - npm install @huggingface/transformers gliner
 *   - ONNX model download (GLiNER-small, ~50MB)
 *   - Model warm-up on first use
 *
 * Architecture:
 *   GLiNER models take text + entity type names and predict spans.
 *   This is ideal for schema-driven extraction: pass field names as
 *   entity types and get span predictions without training data.
 *
 * TODO: Implement with @huggingface/transformers + gliner
 *   - Load GLiNER-small ONNX model
 *   - Pass field names as zero-shot entity types
 *   - Return span predictions with confidence scores
 *   - Cache model in memory for reuse
 *   - Fall back to pattern extraction on model load failure
 *
 * Reference: https://github.com/urchade/GLiNER
 */

import type { FieldDescriptor } from '../extractor.js';

export interface OnnxExtractResult {
  /** Extracted values keyed by field name (null if not available) */
  values: Record<string, unknown> | null;
  /** Per-field confidence [0, 1] */
  confidence: number;
}

/**
 * Extract entities using ONNX NER model. (STUB)
 *
 * This is a placeholder that returns null for all fields.
 * Real implementation in a future iteration will load the
 * GLiNER ONNX model and perform zero-shot NER inference.
 */
export async function onnxExtract(
  _text: string,
  _fields: FieldDescriptor[],
): Promise<OnnxExtractResult> {
  // STUB: Real GLiNER integration pending
  // TODO: Load @huggingface/transformers + gliner
  // TODO: Download GLiNER-small ONNX model
  // TODO: Run inference and extract spans
  return {
    values: null,
    confidence: 0,
  };
}

/** Check whether ONNX extraction is available. */
export function isOnnxAvailable(): boolean {
  // STUB: Check for model availability
  return false;
}
