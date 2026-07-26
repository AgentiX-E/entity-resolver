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
  name: [
    /^name$/i,
    /^full_name$/i,
    /^fullname$/i,
    /^given_name$/i,
    /^first_name$/i,
    /^firstname$/i,
  ],
  surname: [/^surname$/i, /^last_name$/i, /^lastname$/i, /^family_name$/i, /^middle_name$/i],
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

function detectByValue(values: string[]): { type: SemanticType; ratio: number } | null {
  if (values.length === 0) return null;
  const sample = values.filter((v) => v.length > 0).slice(0, 100);

  if (sample.length === 0) return null;

  // Email detection
  const emailRatio = sample.filter((v) => /^[^@]+@[^@]+\.[^@]+$/.test(v)).length / sample.length;
  if (emailRatio > 0.8) return { type: 'email', ratio: emailRatio };

  // Date detection (YYYY-MM-DD or DD-MM-YYYY — must check before phone
  // because date strings also match the loose phone regex)
  const dateRatio =
    sample.filter(
      (v) => /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(v) || /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(v),
    ).length / sample.length;
  if (dateRatio > 0.8) return { type: 'date', ratio: dateRatio };

  // Phone detection (digits + common separators, at least 7 chars)
  // Exclude pure date strings (YYYY-MM-DD) already handled above
  const phoneRatio = sample.filter((v) => /^[\d\s\-+().]{7,}$/.test(v)).length / sample.length;
  if (phoneRatio > 0.8) return { type: 'phone', ratio: phoneRatio };

  // Postcode detection — must contain at least one digit (excludes pure-alpha names)
  const postcodeRatio =
    sample.filter((v) => /^(?=.*\d)[\dA-Z\s\-]{3,10}$/i.test(v)).length / sample.length;
  if (postcodeRatio > 0.8 && sample[0]!.length <= 10)
    return { type: 'postcode', ratio: postcodeRatio };

  // Numeric detection
  const numericRatio = sample.filter((v) => /^\d+(\.\d+)?$/.test(v)).length / sample.length;
  if (numericRatio > 0.9) return { type: 'numeric', ratio: numericRatio };

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
    const valueResult = detectByValue(values);

    // Combined detection: name match + value match = higher confidence
    let semanticType: SemanticType;
    let confidence: number;

    if (nameType && valueResult?.type === nameType) {
      semanticType = nameType;
      confidence = 0.95;
    } else if (nameType) {
      // When value detection disagrees with high confidence (>0.9 ratio),
      // prefer value detection for generic name patterns (like 'code' matching 'identifier')
      if (
        valueResult?.ratio !== undefined &&
        valueResult.ratio > 0.9 &&
        !isSpecificNameMatch(field, nameType)
      ) {
        semanticType = valueResult.type;
        confidence = 0.85;
      } else {
        semanticType = nameType;
        confidence = 0.7;
      }
    } else if (valueResult) {
      semanticType = valueResult.type;
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

/**
 * Check if a name-based type match is highly specific.
 * 'code' → 'identifier' is a generic match (many field names match /code/i).
 * 'email' → 'email' is specific.
 */
function isSpecificNameMatch(field: string, type: SemanticType): boolean {
  // Patterns where the field name is almost certainly the right type
  if (type === 'email') return PATTERNS.email.some((p) => p.test(field));
  if (type === 'phone') return PATTERNS.phone.some((p) => p.test(field));
  if (type === 'date') return PATTERNS.date.some((p) => p.test(field));
  if (type === 'postcode') return PATTERNS.postcode.some((p) => p.test(field));
  return false;
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
      warnings: ['Empty dataset'],
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
  // Prefer high-cardinality fields for blocking.
  // For small datasets (<10 unique values total), relax cardinality threshold.
  const maxCardinality = Math.max(1, ...fields.map((f) => f.cardinality));
  const minCardinality = maxCardinality <= 5 ? 1 : 3;

  const candidates = fields
    .filter((f) => f.cardinality >= minCardinality && f.semanticType !== 'text')
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
  const avgConf = fields.reduce((s, f) => s + f.confidence, 0) / Math.max(fields.length, 1);

  if (avgConf > 0.8) return 0.7;
  if (avgConf > 0.6) return 0.5;
  return 0.3;
}
