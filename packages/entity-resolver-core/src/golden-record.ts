// Golden Record Survivorship — produces canonical master records from clusters.
// Supports field-level survivorship strategies for building Customer 360,
// MDM, and entity consolidation pipelines.

import type { RawRecord } from './types/core.js';

/** Field-level survivorship strategy. */
export type SurvivorStrategy =
  | 'longest' // Prefer the longest non-empty value
  | 'most_popular' // Prefer the most frequent non-empty value
  | 'most_complete' // Prefer the record with the most non-empty fields
  | 'source_priority' // Prefer records from higher-priority sources
  | 'first' // First non-empty value (stable ordering)
  | 'concatenate'; // Concatenate all unique non-empty values

/** Field configuration for golden record generation. */
export interface FieldSurvivorRule {
  /** The field name to apply the strategy to. */
  readonly field: string;
  /** Survivorship strategy for this field. */
  readonly strategy: SurvivorStrategy;
  /** Separator for concatenate strategy. Default: '; '. */
  readonly separator?: string;
}

/** Full golden record generation configuration. */
export interface GoldenRecordConfig {
  /** Field-level survivorship rules. Falls back to 'longest' for unconfigured fields. */
  readonly rules?: readonly FieldSurvivorRule[];
  /** Default strategy for fields not covered by explicit rules. */
  readonly defaultStrategy?: SurvivorStrategy;
  /**
   * Source priority mapping for source_priority strategy.
   * Lower number = higher priority. Source names not in the map get priority 999.
   */
  readonly sourcePriority?: ReadonlyMap<string, number>;
}

/** Result of golden record generation. */
export interface GoldenRecordResult {
  /** The canonical golden record with merged field values. */
  readonly goldenRecord: RawRecord;
  /** Number of source records consolidated. */
  readonly sourceCount: number;
  /** Per-field details about which source contributed each value. */
  readonly fieldSources: Record<string, { readonly value: unknown; readonly from: number[] }>;
}

function nonEmptyValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

function longest(values: { value: unknown; recordIndex: number }[]): unknown {
  let best: unknown = values[0]?.value;
  for (const v of values) {
    if (typeof v.value === 'string' && (typeof best !== 'string' || v.value.length > best.length)) {
      best = v.value;
    }
  }
  return best;
}

function mostPopular(values: { value: unknown; recordIndex: number }[]): unknown {
  const freq = new Map<string, { value: unknown; count: number }>();
  for (const v of values) {
    const key = String(v.value);
    const entry = freq.get(key);
    if (entry) {
      entry.count++;
    } else {
      freq.set(key, { value: v.value, count: 1 });
    }
  }
  let best = values[0]?.value;
  let bestCount = 0;
  for (const [, entry] of freq) {
    if (entry.count > bestCount) {
      best = entry.value;
      bestCount = entry.count;
    }
  }
  return best;
}

function mostComplete(
  values: { value: unknown; recordIndex: number; totalFields: number }[],
): unknown {
  // Find the record with the most non-empty fields
  let best = values[0]?.value;
  let bestFields = 0;
  for (const v of values) {
    if (v.totalFields > bestFields) {
      best = v.value;
      bestFields = v.totalFields;
    }
  }
  return best;
}

function countNonEmpty(record: RawRecord): number {
  return Object.values(record).filter(nonEmptyValue).length;
}

/**
 * Generate a golden (canonical) record from a cluster of matched entity records.
 *
 * Applies field-level survivorship strategies to produce the best single
 * representation of the entity, suitable for Customer 360, MDM systems,
 * and entity consolidation pipelines.
 *
 * @param records - The cluster's member records.
 * @param config  - Survivorship strategy configuration.
 * @returns The golden record with field-level provenance information.
 */
export function buildGoldenRecord(
  records: readonly RawRecord[],
  config: GoldenRecordConfig = {},
): GoldenRecordResult {
  if (records.length === 0) {
    return { goldenRecord: {}, sourceCount: 0, fieldSources: {} };
  }

  const defaultStrategy = config.defaultStrategy ?? 'longest';
  const ruleMap = new Map<string, FieldSurvivorRule>();
  for (const rule of config.rules ?? []) {
    ruleMap.set(rule.field, rule);
  }

  // Collect all unique field names across all records
  const fieldNames = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      fieldNames.add(key);
    }
  }

  const goldenRecord: RawRecord = {};
  const fieldSources: Record<string, { value: unknown; from: number[] }> = {};

  for (const field of fieldNames) {
    const rule = ruleMap.get(field);
    const strategy = rule?.strategy ?? defaultStrategy;

    const values = records
      .map((record, idx) => ({
        value: record[field],
        recordIndex: idx,
        totalFields: countNonEmpty(record),
      }))
      .filter((v) => nonEmptyValue(v.value));

    if (values.length === 0) continue;

    const separator = rule?.separator ?? '; ';
    const allIndices = values.map((v) => v.recordIndex);

    let selectedValue: unknown;

    switch (strategy) {
      case 'longest':
        selectedValue = longest(values);
        break;
      case 'most_popular':
        selectedValue = mostPopular(values);
        break;
      case 'most_complete':
        selectedValue = mostComplete(values);
        break;
      case 'first':
        selectedValue = values[0]!.value;
        break;
      case 'concatenate':
        selectedValue = [...new Set(values.map((v) => String(v.value)))].join(separator);
        break;
      case 'source_priority': {
        const priorities = config.sourcePriority ?? new Map();
        let best = values[0]!;
        let bestPriority = 999;
        for (const v of values) {
          const record = records[v.recordIndex]!;
          const source = String(record._source ?? 'unknown');
          const priority = priorities.get(source) ?? 999;
          if (priority < bestPriority) {
            best = v;
            bestPriority = priority;
          }
        }
        selectedValue = best.value;
        break;
      }
      default:
        selectedValue = values[0]!.value;
    }

    goldenRecord[field] = selectedValue;
    fieldSources[field] = { value: selectedValue, from: allIndices };
  }

  return { goldenRecord, sourceCount: records.length, fieldSources };
}
