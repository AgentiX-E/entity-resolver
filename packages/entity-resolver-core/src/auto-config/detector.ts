// Auto-configuration — zero-config semantic field detection and pipeline setup.
// Analyzes dataset structure and generates optimal blocking, comparison, and threshold configs.

import type { BlockingPass } from '../blocking/types.js';
import type { ComparisonSpec } from '../matching/comparison.js';
import type { PipelineConfig } from '../pipeline/runner.js';
import type { RawRecord } from '../types/core.js';

/** Semantic type inferred for a field. */
export type SemanticType =
  | 'email'
  | 'phone'
  | 'name'
  | 'surname'
  | 'address'
  | 'city'
  | 'postcode'
  | 'date'
  | 'company'
  | 'product'
  | 'numeric'
  | 'identifier'
  | 'text';

/** Detected field metadata. */
export interface DetectedField {
  readonly name: string;
  readonly semanticType: SemanticType;
  readonly confidence: number;
  readonly cardinality: number;
  readonly nullRatio: number;
  readonly isNumeric: boolean;
  readonly avgLength: number;
  readonly sampleValues: readonly string[];
}

/** Complete auto-configuration result. */
export interface AutoConfigResult {
  readonly fields: readonly DetectedField[];
  readonly config: PipelineConfig;
  readonly confidence: number;
  readonly warnings: readonly string[];
}

// ═══════════════════════════════════════════════════════════════
// Field name pattern matching
// ═══════════════════════════════════════════════════════════════

const PATTERNS: Readonly<Record<SemanticType, readonly RegExp[]>> = {
  email: [/^email$/i, /^e_mail$/i, /^mail$/i, /^e-mail$/i],
  phone: [/^phone$/i, /^tel$/i, /^telephone$/i, /^mobile$/i, /^cell$/i, /^contact$/i],
  name: [/^name$/i, /^full_name$/i, /^fullname$/i],
  surname: [/^surname$/i, /^last_name$/i, /^lastname$/i, /^family_name$/i],
  address: [/^address$/i, /^addr$/i, /^street$/i, /^location$/i],
  city: [/^city$/i, /^town$/i, /^municipality$/i, /^state$/i, /^province$/i, /^region$/i],
  postcode: [/^zip$/i, /^zipcode$/i, /^zip_code$/i, /^postcode$/i, /^postal_code$/i, /^postal$/i],
  date: [
    /^date$/i,
    /^dob$/i,
    /^birth_date$/i,
    /^birthdate$/i,
    /^created$/i,
    /^updated$/i,
    /^timestamp$/i,
  ],
  company: [
    /^company$/i,
    /^org$/i,
    /^organization$/i,
    /^organisation$/i,
    /^business$/i,
    /^employer$/i,
  ],
  product: [/^product$/i, /^item$/i, /^sku$/i, /^title$/i, /^description$/i, /^desc$/i],
  numeric: [/^(price|cost|amount|quantity|age|count|number|num|id|rating|score)$/i],
  identifier: [/^(id|uuid|guid|key|code|ref|reference)$/i],
  text: [/.*/], // fallback
};

// ═══════════════════════════════════════════════════════════════
// Value-based type detection
// ═══════════════════════════════════════════════════════════════

function detectByValue(values: string[]): SemanticType | null {
  if (values.length === 0) return null;
  const sample = values.filter((v) => v.length > 0).slice(0, 100);

  if (sample.length === 0) return null;

  // Email detection
  const emailRatio = sample.filter((v) => /^[^@]+@[^@]+\.[^@]+$/.test(v)).length / sample.length;
  if (emailRatio > 0.8) return 'email';

  // Phone detection (digits + common separators)
  const phoneRatio = sample.filter((v) => /^[\d\s\-+().]{7,}$/.test(v)).length / sample.length;
  if (phoneRatio > 0.8) return 'phone';

  // Date detection
  const dateRatio =
    sample.filter(
      (v) => /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(v) || /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(v),
    ).length / sample.length;
  if (dateRatio > 0.8) return 'date';

  // Postcode detection
  const postcodeRatio = sample.filter((v) => /^[\dA-Z]{3,10}$/i.test(v)).length / sample.length;
  if (postcodeRatio > 0.8 && sample[0]!.length <= 10) return 'postcode';

  // Numeric detection
  const numericRatio = sample.filter((v) => /^\d+(\.\d+)?$/.test(v)).length / sample.length;
  if (numericRatio > 0.9) return 'numeric';

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Main detection + configuration
// ═══════════════════════════════════════════════════════════════

/**
 * Analyze a dataset and detect field semantics.
 * Uses combined name-pattern + value-distribution matching.
 */
export function detectFields(records: readonly RawRecord[]): DetectedField[] {
  if (records.length === 0) return [];

  const fields = Object.keys(records[0]!);
  const result: DetectedField[] = [];

  for (const field of fields) {
    const values = records.map((r) => String(r[field] ?? ''));
    const nonNull = values.filter((v) => v.length > 0);
    const nameType = detectByName(field);
    const valueType = detectByValue(values);

    // Combined detection: name match + value match = higher confidence
    let semanticType: SemanticType;
    let confidence: number;

    if (nameType && valueType && nameType === valueType) {
      semanticType = nameType;
      confidence = 0.95;
    } else if (nameType) {
      semanticType = nameType;
      confidence = 0.7;
    } else if (valueType) {
      semanticType = valueType;
      confidence = 0.8;
    } else {
      semanticType = 'text';
      confidence = 0.5;
    }

    result.push({
      name: field,
      semanticType,
      confidence,
      cardinality: new Set(nonNull).size,
      nullRatio: values.length > 0 ? (values.length - nonNull.length) / values.length : 0,
      isNumeric: /^\d+(\.\d+)?$/.test(nonNull[0] ?? ''),
      avgLength: nonNull.reduce((s, v) => s + v.length, 0) / Math.max(nonNull.length, 1),
      sampleValues: nonNull.slice(0, 5),
    });
  }

  return result;
}

function detectByName(field: string): SemanticType | null {
  for (const [type, patterns] of Object.entries(PATTERNS)) {
    if (type === 'text') continue;
    for (const pattern of patterns) {
      if (pattern.test(field)) return type as SemanticType;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Scorer recommendations per semantic type
// ═══════════════════════════════════════════════════════════════

const SCORER_MAP: Readonly<Record<SemanticType, string>> = {
  email: 'exact',
  phone: 'exact',
  name: 'jaro_winkler',
  surname: 'jaro_winkler',
  address: 'token_sort',
  city: 'levenshtein',
  postcode: 'exact',
  date: 'date_diff',
  company: 'token_sort',
  product: 'ensemble',
  numeric: 'numeric_diff',
  identifier: 'exact',
  text: 'tfidf_cosine',
};

/**
 * Auto-generate a PipelineConfig from detected fields.
 */
export function autoConfigure(records: readonly RawRecord[]): AutoConfigResult {
  const detected = detectFields(records);

  if (detected.length === 0) {
    return {
      fields: detected,
      config: {
        blocking: { passes: [] },
        comparisons: [],
        matchThreshold: 0.7,
        autoConfigure: true,
      },
      confidence: 0,
      warnings: ['Empty dataset — cannot auto-configure'],
    };
  }

  // Recommend blocking passes
  const passes = recommendBlockingPasses(detected);

  // Generate comparison specs
  const comparisons = generateComparisons(detected);

  // Auto-select threshold based on field types
  const matchThreshold = computeAutoThreshold(detected);

  // Confidence: average of individual field confidences
  const avgConfidence = detected.reduce((s, f) => s + f.confidence, 0) / detected.length;

  const warnings: string[] = [];
  for (const f of detected) {
    if (f.confidence < 0.7) {
      warnings.push(
        `Low confidence for field "${f.name}" (${f.semanticType}, ${f.confidence.toFixed(2)}). Consider manual review.`,
      );
    }
  }

  return {
    fields: detected,
    config: {
      blocking: { passes },
      comparisons,
      matchThreshold,
      autoConfigure: true,
      tfFields: detected
        .filter((f) => f.semanticType === 'surname' || f.semanticType === 'company')
        .map((f) => f.name),
    },
    confidence: avgConfidence,
    warnings,
  };
}

function recommendBlockingPasses(fields: readonly DetectedField[]): BlockingPass[] {
  // Prefer high-cardinality fields for blocking
  const candidates = fields
    .filter((f) => f.cardinality > 2 && f.semanticType !== 'text')
    .sort((a, b) => b.cardinality - a.cardinality);

  const passes: BlockingPass[] = [];
  const used = new Set<string>();

  // Primary: email or identifier
  for (const f of candidates) {
    if (f.semanticType === 'email' || f.semanticType === 'identifier') {
      passes.push({ fields: [f.name], transforms: ['strip', 'lowercase'] });
      used.add(f.name);
      break;
    }
  }

  // Secondary: name + surname combination
  const nameFields = candidates.filter(
    (f) => (f.semanticType === 'name' || f.semanticType === 'surname') && !used.has(f.name),
  );
  if (nameFields.length >= 2) {
    passes.push({
      fields: nameFields.slice(0, 2).map((f) => f.name),
      transforms: ['strip', 'lowercase'],
    });
    nameFields.forEach((f) => used.add(f.name));
  } else if (nameFields.length === 1) {
    passes.push({ fields: [nameFields[0]!.name], transforms: ['strip', 'lowercase', 'soundex'] });
    used.add(nameFields[0]!.name);
  }

  // Tertiary: date or city
  for (const f of candidates) {
    if (used.has(f.name)) continue;
    if (f.semanticType === 'date' || f.semanticType === 'city' || f.semanticType === 'postcode') {
      passes.push({ fields: [f.name], transforms: ['strip', 'lowercase'] });
      used.add(f.name);
      break;
    }
  }

  // Fallback: use highest-cardinality field
  if (passes.length === 0 && candidates.length > 0) {
    passes.push({ fields: [candidates[0]!.name], transforms: ['strip', 'lowercase'] });
  }

  return passes;
}

function generateComparisons(fields: readonly DetectedField[]): ComparisonSpec[] {
  return fields
    .filter((f) => f.semanticType !== 'text' || f.confidence > 0.6)
    .slice(0, 6) // Limit to top 6 fields
    .map((f) => {
      const scorer = SCORER_MAP[f.semanticType] ?? 'levenshtein';
      return {
        field: f.name,
        scorerName: scorer,
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'strong_match', threshold: 0.85 },
          { label: 'moderate_match', threshold: 0.7 },
          { label: 'weak_match', threshold: 0.5 },
        ],
      };
    });
}

function computeAutoThreshold(fields: readonly DetectedField[]): number {
  // Stricter threshold for high-confidence fields
  const avgConf = fields.reduce((s, f) => s + f.confidence, 0) / Math.max(fields.length, 1);

  if (avgConf > 0.9) return 0.7;
  if (avgConf > 0.7) return 0.5;
  return 0.3;
}
