/**
 * extract() — Main entity extraction orchestrator.
 *
 * Implements the "Pattern-First, LLM-Last" cascade architecture:
 *   Layer 1 (I13): Pattern Match — regex + dictionary, <1ms, ~70% coverage
 *   Layer 2 (I16): ONNX NER      — GLiNER zero-shot, <20ms, ~20% coverage
 *   Layer 3 (I16): LLM Fallback  — DeepSeek/OpenAI, <2s, ~10% coverage
 *
 * For I13, only Layer 1 is implemented. Layers 2 and 3 are stubs
 * that return null, allowing the system to function in pattern-only mode.
 *
 * Two extraction modes:
 *   General mode:   extract(schema, text) — pure schema-driven
 *   Intent-enhanced: extract(schema, text, { intent: 'alarm', context: {...} })
 *                    — uses intent context to boost relevant field extraction
 *   Intent-enhanced mode is implemented in I15.
 */

import { PatternRegistry } from './pattern/pattern-registry.js';
import { registerBuiltins } from './pattern/builtin-patterns.js';
import { extractPatterns } from './pattern/pattern-extractor.js';
import type { FieldExtraction } from './pattern/pattern-extractor.js';
import { normalizeText } from './normalization/value-normalizer.js';
import { coerce } from './normalization/type-coercion.js';
import type { CoercionTarget } from './normalization/type-coercion.js';

// Re-export the ExtractionResult interface
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

/**
 * Schema field descriptor — minimal representation derived from
 * zod schema introspection. In I13 this is manually constructed;
 * in I16 it will be auto-derived from actual zod schemas.
 */
export interface FieldDescriptor {
  /** Field name (from schema key) */
  name: string;
  /** Expected type: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'phone' | 'url' | etc. */
  type: string;
  /** Human-readable description (from .describe() or field name) */
  description?: string;
  /** Whether this field is required */
  required?: boolean;
}

export interface ExtractOptions {
  /** Intent name for intent-enhanced mode (I15) */
  intent?: string;
  /** Context from previous turns for slot inheritance (I15) */
  context?: Record<string, unknown>;
  /** Custom PatternRegistry — if not provided, builtins are used */
  registry?: PatternRegistry;
  /** Enable ONNX NER layer (I16) */
  enableOnnx?: boolean;
  /** Enable LLM fallback (I16) */
  enableLlm?: boolean;
  /**
   * Inject ONNX extraction results for testing. (I16 — internal test hook)
   * Maps field name → FieldExtraction.
   * @internal
   */
  _onnxInjection?: Map<string, FieldExtraction>;
  /**
   * Inject LLM extraction results for testing. (I16 — internal test hook)
   * Maps field name → FieldExtraction.
   * @internal
   */
  _llmInjection?: Map<string, FieldExtraction>;
}

// ─── Default registry (lazy-initialized singleton) ──────────────────

let defaultRegistry: PatternRegistry | null = null;

function getDefaultRegistry(): PatternRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new PatternRegistry();
    registerBuiltins(defaultRegistry);
  }
  return defaultRegistry;
}

// ─── Schema field type introspection ─────────────────────────────────

/**
 * Derive extraction field types from FieldDescriptors.
 *
 * Maps each field's declared type to the corresponding pattern matcher name.
 * Falls back to 'string' (no pattern matching) for unknown types.
 */
function deriveFieldTypes(fields: FieldDescriptor[]): Record<string, string> {
  const fieldTypes: Record<string, string> = {};
  for (const field of fields) {
    fieldTypes[field.name] = field.type;
  }
  return fieldTypes;
}

// ─── Main extract function ───────────────────────────────────────────

/**
 * Extract structured entities from unstructured text.
 *
 * @param text - The input text to extract from
 * @param fields - Schema field descriptors defining what to extract
 * @param options - Extraction options (mode, registry, toggles)
 * @returns ExtractionResult with values, provenance, and confidence
 *
 * @example
 * ```typescript
 * const result = extract(
 *   "Contact john@example.com or call +86-13800000000",
 *   [
 *     { name: 'email', type: 'email' },
 *     { name: 'phone', type: 'phone' }
 *   ]
 * );
 * // result.values = { email: 'john@example.com', phone: '+86-13800000000' }
 * ```
 */
export function extract(
  text: string,
  fields: FieldDescriptor[],
  options: ExtractOptions = {},
): ExtractionResult {
  const normalizedText = normalizeText(text);
  const registry = options.registry ?? getDefaultRegistry();
  const fieldTypes = deriveFieldTypes(fields);

  // ── Layer 1: Pattern Match ─────────────────────────────────────────
  const patternResult = extractPatterns(normalizedText, fieldTypes, registry);

  // ── Layer 2: ONNX NER (stub — I16) ─────────────────────────────────
  const onnxResult = options._onnxInjection ?? new Map<string, FieldExtraction>();

  // ── Layer 3: LLM Fallback (stub — I16) ─────────────────────────────
  const llmResult = options._llmInjection ?? new Map<string, FieldExtraction>();

  // ── Assemble results ───────────────────────────────────────────────
  const values: Record<string, unknown> = {};
  const provenance: Record<string, 'pattern' | 'onnx' | 'llm'> = {};
  const confidence: Record<string, number> = {};

  for (const field of fields) {
    // Try pattern first
    const patternField = patternResult.fields.get(field.name);
    if (patternField?.match) {
      const coerced = coerce(patternField.match.value, field.type as CoercionTarget);
      if (coerced.success) {
        values[field.name] = coerced.value;
        provenance[field.name] = 'pattern';
        confidence[field.name] = patternField.match.confidence;
        continue;
      }
    }

    // Try ONNX (stub)
    const onnxField = onnxResult.get(field.name);
    if (onnxField?.match) {
      values[field.name] = onnxField.match.value;
      provenance[field.name] = 'onnx';
      confidence[field.name] = onnxField.match.confidence;
      continue;
    }

    // Try LLM (stub)
    const llmField = llmResult.get(field.name);
    if (llmField?.match) {
      values[field.name] = llmField.match.value;
      provenance[field.name] = 'llm';
      confidence[field.name] = llmField.match.confidence;
      continue;
    }

    // No match found — set undefined
    values[field.name] = undefined;
    provenance[field.name] = 'pattern'; // attempted but failed
    confidence[field.name] = 0;
  }

  return { values, provenance, confidence, normalizedText };
}

// ─── Convenience exports ─────────────────────────────────────────────

export { PatternRegistry } from './pattern/pattern-registry.js';
export { registerBuiltins } from './pattern/builtin-patterns.js';
export { extractPatterns } from './pattern/pattern-extractor.js';
export type { PatternMatch, PatternMatcher, PatternRegistration } from './pattern/pattern-registry.js';
export type { FieldExtraction, PatternExtractionResult } from './pattern/pattern-extractor.js';
export { normalizeText } from './normalization/value-normalizer.js';
export { coerce, coerceAll } from './normalization/type-coercion.js';
export type { CoercionResult, CoercionTarget } from './normalization/type-coercion.js';
