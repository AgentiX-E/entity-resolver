// ComparisonSpec and ComparisonVector — Splink-compatible comparison system.
// Enables multi-level per-field comparison with configurable thresholds.

import type { FieldMetadata } from '../types/core.js';
import { getScorer } from './scorers/registry.js';

/** A single comparison level with a threshold. */
export interface ComparisonLevel {
  /** Label for diagnostics (e.g., "exact_match", "levenshtein<2"). */
  readonly label: string;
  /** Score threshold for this level. Values >= threshold are assigned to this level. */
  readonly threshold: number;
}

/** Configuration for comparing a single field. */
export interface ComparisonSpec {
  /** The field being compared. */
  readonly field: string;
  /** Scorer name (from registry). */
  readonly scorerName: string;
  /** Ordered comparison levels (first match wins). */
  readonly levels: readonly ComparisonLevel[];
}

/**
 * A comparison vector — the comparison result for a single field
 * between two records.
 */
export interface ComparisonVector {
  /** Field name. */
  readonly field: string;
  /** The comparison level that matched (first level whose threshold was met). */
  readonly level: string;
  /** The raw similarity score. */
  readonly score: number;
  /** The scorer used. */
  readonly scorer: string;
}

/**
 * Generate comparison vectors for a pair of records given comparison specs.
 * For each spec, compares the two records' field values and assigns
 * the first matching level.
 */
export function generateComparisonVectors(
  recordA: Record<string, unknown>,
  recordB: Record<string, unknown>,
  specs: readonly ComparisonSpec[],
  fieldMetadata: Map<string, FieldMetadata>,
): ComparisonVector[] {
  const vectors: ComparisonVector[] = [];

  for (const spec of specs) {
    const scorer = getScorer(spec.scorerName);
    const meta = fieldMetadata.get(spec.field) ?? {
      name: spec.field,
      semanticType: 'string',
      cardinality: 0,
      isNumeric: false,
    };

    const rawScore = scorer.score(recordA[spec.field], recordB[spec.field], meta);

    // Find the first level where the score meets the threshold
    let matchedLevel = 'not_match';
    for (const level of spec.levels) {
      if (rawScore >= level.threshold) {
        matchedLevel = level.label;
        break;
      }
    }

    vectors.push({
      field: spec.field,
      level: matchedLevel,
      score: rawScore,
      scorer: spec.scorerName,
    });
  }

  return vectors;
}

/** Common comparison level presets. */
export const COMPARISON_LEVELS = {
  EXACT_MATCH: { label: 'exact_match', threshold: 0.99 },
  STRONG_MATCH: { label: 'strong_match', threshold: 0.85 },
  MODERATE_MATCH: { label: 'moderate_match', threshold: 0.7 },
  WEAK_MATCH: { label: 'weak_match', threshold: 0.5 },
} as const satisfies Record<string, ComparisonLevel>;

/** Generate a standard Splink-style ComparisonSpec for a name field. */
export function nameComparisonSpec(field: string): ComparisonSpec {
  return {
    field,
    scorerName: 'jaro_winkler',
    levels: [
      COMPARISON_LEVELS.EXACT_MATCH,
      COMPARISON_LEVELS.STRONG_MATCH,
      COMPARISON_LEVELS.MODERATE_MATCH,
      COMPARISON_LEVELS.WEAK_MATCH,
    ],
  };
}

/** Generate a standard Splink-style ComparisonSpec for an email field. */
export function emailComparisonSpec(field: string): ComparisonSpec {
  return {
    field,
    scorerName: 'exact',
    levels: [COMPARISON_LEVELS.EXACT_MATCH],
  };
}

/** Generate a standard Splink-style ComparisonSpec for a date field. */
export function dateComparisonSpec(field: string): ComparisonSpec {
  return {
    field,
    scorerName: 'date_diff',
    levels: [
      COMPARISON_LEVELS.EXACT_MATCH,
      { label: 'within_30_days', threshold: 0.92 },
      COMPARISON_LEVELS.STRONG_MATCH,
    ],
  };
}
