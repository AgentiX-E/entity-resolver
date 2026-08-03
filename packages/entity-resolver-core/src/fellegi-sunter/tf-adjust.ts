// Term Frequency Adjustment — reduces match weights for high-frequency values.
// Prevents false positives from common values (e.g., surname "Smith").

import { getFieldString } from '../types/core.js';

/**
 * Term frequency statistics for a single field-value pair.
 */
export interface TermFrequency {
  /** The field name. */
  readonly field: string;
  /** The value being analyzed. */
  readonly value: string;
  /** How many times this value appears in the dataset. */
  readonly frequency: number;
  /** Total number of records in the dataset. */
  readonly totalRecords: number;
  /** Frequency ratio: frequency / totalRecords. */
  readonly ratio: number;
}

/**
 * Build term frequency statistics for a set of records.
 */
export function buildTermFrequencies(
  records: readonly Record<string, unknown>[],
  fields: readonly string[],
): Map<string, TermFrequency[]> {
  const result = new Map<string, TermFrequency[]>();

  for (const field of fields) {
    const freqMap = new Map<string, number>();
    const totalRecords = records.length;

    for (const record of records) {
      const value = getFieldString(record, field)
        .trim()
        .toLowerCase();
      if (value === '') continue;
      freqMap.set(value, (freqMap.get(value) ?? 0) + 1);
    }

    const frequencies: TermFrequency[] = [];
    for (const [value, frequency] of freqMap) {
      frequencies.push({
        field,
        value,
        frequency,
        totalRecords,
        ratio: frequency / totalRecords,
      });
    }

    result.set(field, frequencies);
  }

  return result;
}

/**
 * Compute the term frequency adjustment factor for a value.
 *
 * I42: Splink-equivalent formula:
 *   adjusted_u = max(min_u, u * (1 + log10(GREATEST(tf_l, tf_r) / N)))
 *
 * This adjusts the u-probability BEFORE log₂, which is mathematically
 * correct in the Fellegi-Sunter framework. The previous heuristic
 * (1 - log₁₀(f)/log₁₀(N)) multiplied weights after log₂, which broke
 * calibration.
 *
 * Parameters:
 *   leftFreq  — frequency in left dataset
 *   rightFreq — frequency in right dataset
 *   totalRecords — total records in the union
 *   baseU — baseline u-probability before TF adjustment
 *   minU — floor for adjusted u (default 1e-6)
 *
 * Returns: adjusted u-probability with TF correction applied
 */
export function computeTFAdjustmentSplink(
  leftFreq: number,
  rightFreq: number,
  totalRecords: number,
  baseU: number,
  minU = 1e-6,
): number {
  // Edge cases
  if (totalRecords <= 0 || baseU <= 0) return baseU;
  if (leftFreq <= 0 && rightFreq <= 0) return baseU;

  // Splink: use the MORE common value
  const freq = Math.max(leftFreq, rightFreq);
  const freqRatio = freq / totalRecords;

  // Splink formula: adjusted_u = max(min_u, u * (1 + log10(tf_ratio)))
  // log10(tf_ratio) is negative for rare values (penalizes LESS)
  // log10(tf_ratio) is near 0 for common values (penalizes MORE)
  const tfFactor = 1 + Math.log10(Math.max(freqRatio, minU));

  return Math.max(minU, baseU * Math.max(tfFactor, 0.01));
}

/**
 * Compute the term frequency adjustment factor for a value (legacy).
 *
 * @deprecated I42: Use computeTFAdjustmentSplink() for proper u-level adjustment
 */
export function computeTFAdjustment(frequency: number, totalRecords: number): number {
  if (frequency <= 0 || totalRecords <= 1) return 1;
  if (frequency >= totalRecords) return 0.1;

  const logFreq = Math.log10(frequency);
  const logTotal = Math.log10(totalRecords);

  if (logTotal === 0) return 1;

  const rawAdjustment = 1 - logFreq / logTotal;
  return Math.max(0.1, rawAdjustment);
}

/**
 * Adjust a match weight by term frequency.
 *
 * adjustedWeight = weight * tfAdjustment
 *
 * This reduces the contribution of high-frequency values to the total match weight.
 */
export function adjustWeightByTF(weight: number, frequency: number, totalRecords: number): number {
  const adjustment = computeTFAdjustment(frequency, totalRecords);
  return weight * adjustment;
}

/**
 * Pre-computed TF adjustment lookup for batch processing.
 */
export class TFAdjustmentLookup {
  private readonly lookup: Map<string, number>;

  constructor(frequencies: Map<string, TermFrequency[]>) {
    this.lookup = new Map();
    for (const [, freqList] of frequencies) {
      for (const tf of freqList) {
        const key = `${tf.field}:${tf.value}`;
        const adjustment = computeTFAdjustment(tf.frequency, tf.totalRecords);
        this.lookup.set(key, adjustment);
      }
    }
  }

  /**
   * Get the TF adjustment factor for a field-value pair.
   * Returns 1.0 (no adjustment) if the value is not in the lookup.
   */
  getAdjustment(field: string, value: unknown): number {
    const normalized = getFieldString({_v: value}, '_v')
      .trim()
      .toLowerCase();
    if (normalized === '') return 1;
    return this.lookup.get(`${field}:${normalized}`) ?? 1;
  }
}
