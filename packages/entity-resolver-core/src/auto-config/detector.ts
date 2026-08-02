// Auto-configuration — zero-config semantic field detection and pipeline setup.
// Analyzes dataset structure and generates optimal blocking, comparison, and threshold configs.

import type { BlockingPass } from '../blocking/types.js';
import type { ComparisonSpec } from '../matching/comparison.js';
import type { PipelineConfig } from '../pipeline/runner.js';
import { getFieldString } from '../types/core.js';
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
    const values = records.map((r) => getFieldString(r, field));
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
      isNumeric: (() => {
        const sample = nonNull.slice(0, 100);
        if (sample.length === 0) return false;
        const numericCount = sample.filter(v => /^\d+(\.\d+)?$/.test(v)).length;
        return numericCount / sample.length > 0.8;
      })(),
      avgLength: nonNull.reduce((s, v) => s + v.length, 0) / Math.max(nonNull.length, 1),
      sampleValues: nonNull.slice(0, 5),
    });
  }

  // ── I36: Cardinality guard post-processing ──
  // Fields with near-unique values (≥95% cardinality) cannot be
  // phone/zip/numeric — they are identifiers. This mirrors GoldenMatch's
  // cardinality-based reclassification.
  const n = records.length;
  const cardinalityFloor = Math.max(0.95, 1 - 1 / Math.sqrt(n));
  const reclassifiableTypes = new Set<SemanticType>(['phone', 'postcode', 'numeric', 'address']);

  for (const field of result) {
    const cardRatio = field.cardinality / n;
    if (reclassifiableTypes.has(field.semanticType) && cardRatio >= cardinalityFloor) {
      // Mutating readonly interface fields via cast — safe post-processing
      (field as any).semanticType = 'identifier';
      (field as any).confidence = 0.85;
    }
  }

  // ── I36: Short-code detection ──
  // Alphanumeric columns with 3-12 char length, ≥50% rows containing
  // both letters and digits → likely product codes or reference IDs
  // → use qgram scorer for substring matching.
  for (const field of result) {
    if (field.semanticType !== 'text' && field.semanticType !== 'identifier') continue;
    if (field.avgLength < 3 || field.avgLength > 12) continue;

    const mixedCount = field.sampleValues.filter(
      (v) => /[a-zA-Z]/.test(v) && /\d/.test(v),
    ).length;
    if (mixedCount >= field.sampleValues.length * 0.5) {
      // Tag as short-code for scorer selection in generateComparisons
      (field as any)._shortCode = true;
    }
  }

  // ── I36: Multi-value name detection ──
  // Columns with comma/semicolon-delimited values, average >30 chars,
  // and ≥70% rows containing ≥2 delimiters → multi-valued name fields.
  for (const field of result) {
    if (field.semanticType !== 'text' && field.semanticType !== 'name') continue;
    if (field.avgLength <= 30) continue;

    const withDelims = field.sampleValues.filter(
      (v) => (v.match(/[,;]/g)?.length ?? 0) >= 2,
    ).length;
    if (withDelims >= field.sampleValues.length * 0.7) {
      (field as any)._multiValue = true;
    }
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
  name: 'ensemble',       // I35: GoldenMatch max(jw, ts, 0.8×sx) — catches typos+reordering+phonetic
  surname: 'ensemble',    // I35: Same ensemble for surnames — handles spelling variants
  address: 'token_sort',  // I35: noise-aware — upgraded to jaro_winkler if cardinality < 0.5
  city: 'levenshtein',
  postcode: 'exact',
  date: 'date_diff',
  company: 'ensemble',    // I35: Company names benefit from ensemble (abbreviations + reordering)
  product: 'ensemble',    // I35: Already ensemble, maintained
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

  // ── Strategy 1: Exact match on strong identifiers ──
  // Emails, phone numbers, and structured IDs are near-unique —
  // block on them first with exact matching (no transforms needed).
  for (const f of candidates) {
    if (f.semanticType === 'email' || f.semanticType === 'phone' || f.semanticType === 'identifier') {
      passes.push({ fields: [f.name], transforms: ['strip', 'lowercase'] });
      used.add(f.name);
      break;
    }
  }

  // ── Strategy 2: Name + surname combination ──
  // Most entity resolution datasets benefit from blocking on name fields.
  // Use exact+phonetic alternation for robustness against typos.
  const nameFields = candidates.filter(
    (f) => (f.semanticType === 'name' || f.semanticType === 'surname') && !used.has(f.name),
  );
  if (nameFields.length >= 2) {
    // Two name fields: block on both (exact match)
    passes.push({
      fields: nameFields.slice(0, 2).map((f) => f.name),
      transforms: ['strip', 'lowercase'],
    });
    // Also add soundex pass on single name field for typo resilience
    passes.push({
      fields: [nameFields[0]!.name],
      transforms: ['strip', 'lowercase', 'soundex'],
    });
    nameFields.forEach((f) => used.add(f.name));
  } else if (nameFields.length === 1) {
    // Single name: exact + phonetic + token passes
    passes.push({ fields: [nameFields[0]!.name], transforms: ['strip', 'lowercase'] });
    passes.push({ fields: [nameFields[0]!.name], transforms: ['strip', 'lowercase', 'soundex'] });
    used.add(nameFields[0]!.name);
  }

  // ── Strategy 3: Location fields ──
  // Cities, states, and postcodes provide geographic blocking.
  for (const f of candidates) {
    if (used.has(f.name)) continue;
    if (f.semanticType === 'city' || f.semanticType === 'postcode') {
      passes.push({ fields: [f.name], transforms: ['strip', 'lowercase'] });
      used.add(f.name);
      break;
    }
  }

  // ── Strategy 4: Product title blocking (for e-commerce) ──
  const productFields = candidates.filter(
    (f) => (f.semanticType === 'product') && !used.has(f.name),
  );
  if (productFields.length > 0) {
    // Product titles: use soundex for phonetic variant matching
    // across different retailer naming conventions.
    passes.push({
      fields: [productFields[0]!.name],
      transforms: ['strip', 'lowercase', 'soundex'],
    });
    used.add(productFields[0]!.name);
  }

  // ── Strategy 5: Date blocking ──
  for (const f of candidates) {
    if (used.has(f.name)) continue;
    if (f.semanticType === 'date') {
      passes.push({ fields: [f.name], transforms: ['strip'] });
      used.add(f.name);
      break;
    }
  }

  // ── Strategy 6: Remaining high-cardinality fields ──
  const remaining = candidates.filter((f) => !used.has(f.name));
  if (remaining.length > 0) {
    passes.push({
      fields: [remaining[0]!.name],
      transforms: ['strip', 'lowercase', 'soundex'],
    });
    used.add(remaining[0]!.name);
  }

  // ── Fallback: highest-cardinality field, exact match ──
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
      let scorer = SCORER_MAP[f.semanticType] ?? 'levenshtein';

      // ── Short-code scorer selection (I36) ──
      if ((f as any)._shortCode) {
        scorer = 'qgram_jaccard';
      }

      // ── Multi-value scorer selection (I36) ──
      if ((f as any)._multiValue) {
        scorer = 'token_sort';
      }

      // ── Noise-aware scorer upgrade (I35) ──
      if (scorer === 'token_sort' && f.cardinality / f.sampleValues.length < 0.5) {
        scorer = 'jaro_winkler';
      }

      const thresholds = computeFieldThresholds(f);

      // ── Confidence-weighted field scoring (I36) ──
      // Low-confidence (<0.5) classifications are capped at weight 0.3
      // to prevent them from dominating the aggregate score.
      const effectiveWeight = f.confidence < 0.5 ? 0.3 : undefined;

      return {
        field: f.name,
        scorerName: scorer,
        levels: [
          { label: 'exact_match', threshold: thresholds.exact },
          { label: 'strong_match', threshold: thresholds.strong },
          { label: 'moderate_match', threshold: thresholds.moderate },
          { label: 'weak_match', threshold: thresholds.weak },
        ],
        ...(effectiveWeight !== undefined && { weight: effectiveWeight }),
      };
    });
}

/** Compute per-field threshold levels based on field statistics. */
interface FieldThresholds {
  exact: number;
  strong: number;
  moderate: number;
  weak: number;
}

function computeFieldThresholds(f: DetectedField): FieldThresholds {
  // Short fields (avg < 5 chars): tighter thresholds — small differences matter more
  // Very short fields (avg < 3 chars): use exact-only matching
  if (f.avgLength < 3 || f.semanticType === 'postcode' || f.semanticType === 'numeric') {
    return { exact: 0.95, strong: 0.90, moderate: 0.80, weak: 0.65 };
  }
  // Medium-length name/address fields: standard thresholds
  if (f.avgLength < 8 || f.semanticType === 'name' || f.semanticType === 'surname') {
    return { exact: 0.95, strong: 0.85, moderate: 0.70, weak: 0.50 };
  }
  // Long text/product fields: relaxed thresholds — large strings can differ significantly
  return { exact: 0.95, strong: 0.80, moderate: 0.60, weak: 0.35 };
}

function computeAutoThreshold(fields: readonly DetectedField[]): number {
  const avgConf = fields.reduce((s, f) => s + f.confidence, 0) / Math.max(fields.length, 1);

  if (avgConf > 0.8) return 0.7;
  if (avgConf > 0.6) return 0.5;
  return 0.3;
}
