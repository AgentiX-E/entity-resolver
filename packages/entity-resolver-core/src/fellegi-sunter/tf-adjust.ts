// Term Frequency Adjustment — reduces match weights for high-frequency values.
// Prevents false positives from common values (e.g., surname "Smith").

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
      const value = String(record[field] ?? '')
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
 * Formula: adjustment = max(0.1, 1 - log10(frequency) / log10(totalRecords))
 *
 * Rare values (frequency ~ 1) → adjustment ~ 1.0 (no reduction)
 * Common values (frequency ~ N/10) → adjustment ~ 0.5 (50% reduction)
 * Extremely common (frequency ~ N) → adjustment = 0.1 (floor)
 *
 * This follows Splink's approach: common values provide weaker match evidence.
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
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === '') return 1;
    return this.lookup.get(`${field}:${normalized}`) ?? 1;
  }
}
