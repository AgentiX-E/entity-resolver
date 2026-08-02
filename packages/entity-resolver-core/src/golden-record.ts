// Golden Record Survivorship — produces canonical master records from clusters.
// Supports field-level survivorship strategies for building Customer 360,
// MDM, and entity consolidation pipelines.

import type { RawRecord } from './types/core.js';

/** Field-level survivorship strategy. */
export type SurvivorStrategy =
  | 'longest'
  | 'most_popular'
  | 'most_complete'
  | 'source_priority'
  | 'first'
  | 'concatenate'
  | 'avg' // Numeric average
  | 'min' // Numeric minimum
  | 'max' // Numeric maximum
  | 'sum' // Numeric sum
  | 'median' // Numeric median
  | 'most_recent' // Most recent date (ISO 8601)
  | 'oldest'; // Oldest date (ISO 8601)

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

/** Apply a numeric aggregation to values. Falls back to first value if not all numeric. */
function numericAggregate(
  values: { value: unknown; recordIndex: number }[],
  fn: (nums: number[]) => number,
): unknown {
  const nums: number[] = [];
  for (const v of values) {
    const n = Number(v.value);
    if (Number.isFinite(n)) nums.push(n);
  }
  if (nums.length === 0) return values[0]!.value;
  return fn(nums);
}

/** Select most recent or oldest date value. */
function dateExtreme(
  values: { value: unknown; recordIndex: number }[],
  isBetter: (a: number, b: number) => boolean,
): unknown {
  let best = values[0]!;
  let bestTime = Date.parse(String(best.value));
  for (const v of values) {
    const t = Date.parse(String(v.value));
    if (Number.isFinite(t) && (!Number.isFinite(bestTime) || isBetter(t, bestTime))) {
      best = v;
      bestTime = t;
    }
  }
  return best.value;
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
        const priorities = config.sourcePriority ?? new Map<string, number>();
        let best = values[0]!;
        let bestPriority = 999;
        for (const v of values) {
          const record = records[v.recordIndex]!;
          const source = typeof record._source === 'string' ? record._source : 'unknown';
          const priority: number = priorities.get(source) ?? 999;
          if (priority < bestPriority) {
            best = v;
            bestPriority = priority;
          }
        }
        selectedValue = best.value;
        break;
      }
      case 'avg':
        selectedValue = numericAggregate(
          values,
          (nums) => nums.reduce((s, n) => s + n, 0) / nums.length,
        );
        break;
      case 'min':
        selectedValue = numericAggregate(values, (nums) => Math.min(...nums));
        break;
      case 'max':
        selectedValue = numericAggregate(values, (nums) => Math.max(...nums));
        break;
      case 'sum':
        selectedValue = numericAggregate(values, (nums) => nums.reduce((s, n) => s + n, 0));
        break;
      case 'median':
        selectedValue = numericAggregate(values, (nums) => {
          const sorted = [...nums].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
        });
        break;
      case 'most_recent':
        selectedValue = dateExtreme(values, (a, b) => a > b);
        break;
      case 'oldest':
        selectedValue = dateExtreme(values, (a, b) => a < b);
        break;
      default:
        selectedValue = values[0]!.value;
    }

    goldenRecord[field] = selectedValue;
    fieldSources[field] = { value: selectedValue, from: allIndices };
  }

  return { goldenRecord, sourceCount: records.length, fieldSources };
}
