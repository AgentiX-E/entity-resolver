/**
 * PatternExtractor — Field-level pattern matching using the PatternRegistry.
 *
 * Given a set of field names and the pre-registered PatternRegistry,
 * PatternExtractor runs each field against the text and returns matches.
 *
 * This is Layer 1 of the extraction cascade (Pattern Match).
 * Layer 2 (ONNX NER) and Layer 3 (LLM fallback) are handled by the
 * main extract() orchestrator in extractor.ts.
 */

import type { PatternMatch, PatternRegistry } from './pattern-registry.js';

export interface FieldExtraction {
  /** Field name (from schema) */
  field: string;
  /** Best match for this field, or null if no pattern matched */
  match: PatternMatch | null;
  /** The field type used for lookup (e.g. 'email', 'phone') */
  fieldType: string;
}

export interface PatternExtractionResult {
  /** Per-field extraction results */
  fields: Map<string, FieldExtraction>;
  /** Fields successfully extracted */
  matched: string[];
  /** Fields that could not be matched by patterns */
  unmatched: string[];
}

/**
 * Map schema field types to pattern registry field types.
 *
 * Schema types like z.string(), z.number(), z.boolean(), z.date() are mapped
 * to the corresponding pattern matcher names. This mapping is heuristic-based
 * and can be overridden by the user through the schema's .describe() metadata.
 */
const typeMap: Record<string, string> = {
  email: 'email',
  phone: 'phone',
  url: 'url',
  number: 'number',
  integer: 'integer',
  boolean: 'boolean',
  date: 'date',
  time: 'time',
  datetime: 'date',
  string: 'string', // generic string — no pattern match
};

/**
 * Attempt to match a set of field definitions against the given text.
 *
 * @param text - The normalized text to search
 * @param fieldTypes - Map of field name → expected type (e.g. { "email_addr": "email" })
 * @param registry - The PatternRegistry with registered matchers
 * @returns Extraction result with per-field matches
 */
export function extractPatterns(
  text: string,
  fieldTypes: Record<string, string>,
  registry: PatternRegistry,
): PatternExtractionResult {
  const fields = new Map<string, FieldExtraction>();
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const [fieldName, schemaType] of Object.entries(fieldTypes)) {
    const patternType = typeMap[schemaType] ?? schemaType;
    const match = registry.extract(patternType, text);

    const fieldResult: FieldExtraction = {
      field: fieldName,
      match,
      fieldType: patternType,
    };

    fields.set(fieldName, fieldResult);

    if (match) {
      matched.push(fieldName);
    } else {
      unmatched.push(fieldName);
    }
  }

  return { fields, matched, unmatched };
}
