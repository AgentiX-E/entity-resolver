/**
 * Core types for the unified entity-resolution benchmark system.
 *
 * All types are JSON-serializable so results can be written directly
 * to disk and consumed by the HTML reporter or CI pipeline.
 */

/** A single scored match pair produced by any ER engine. */
export interface MatchPair {
  leftId: number;
  rightId: number;
  score: number;
  probability?: number;
}

/** Classification metrics for a single benchmark run. */
export interface ClassificationMetrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  predictedPairs: number;
  truePairs: number;
}

/** Aggregated metrics across N repeated runs. */
export interface AggregatedMetrics extends ClassificationMetrics {
  /** Standard deviation of F1 across runs. */
  f1StdDev: number;
  /** Standard deviation of precision across runs. */
  precisionStdDev: number;
  /** Standard deviation of recall across runs. */
  recallStdDev: number;
  /** Number of repeated runs. */
  runs: number;
  /** Per-run F1 values for statistical tests. */
  f1Values: number[];
}

/** Timing statistics across repeated runs. */
export interface TimingStats {
  meanMs: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  runs: number;
  perRunMs: number[];
}

/** Dataset descriptor with standard metadata. */
export interface DatasetConfig {
  /** Unique identifier (e.g., "DBLP-ACM"). */
  name: string;
  /** "dedupe" | "linkage" */
  mode: 'dedupe' | 'linkage';
  /** Total record count (left + right for linkage). */
  recordCount: number;
  /** Number of true matching pairs in ground truth. */
  trueMatchCount: number;
  /** Source (e.g., "Leipzig Group", "FEBRL synthetic"). */
  source: string;
  /** File path to left-side CSV (or single CSV for dedupe). */
  leftPath: string;
  /** File path to right-side CSV (null for dedupe). */
  rightPath: string | null;
  /** File path to perfect mapping CSV. */
  mappingPath: string;
  /** CSV encoding for pandas loading. */
  encoding: string;
  /** Column renames for right-side CSV (e.g., {name: "title"}). */
  renameColumns?: Record<string, string>;
}

/** Result for a single tool on a single dataset. */
export interface DatasetResult {
  dataset: string;
  mode: string;
  tool: string;
  recordCount: number;
  trueMatchCount: number;
  metrics: AggregatedMetrics;
  timing: TimingStats;
  /** Total candidate pairs produced. */
  candidatePairs: number;
  /** Configuration fingerprint for reproducibility. */
  configFingerprint: string;
  /** Version of the tool. */
  toolVersion: string;
}

/** Top-level benchmark report. */
export interface BenchmarkReport {
  timestamp: string;
  entityResolverVersion: string;
  competitorVersions: Record<string, string>;
  results: DatasetResult[];
  comparisonMatrix: ComparisonMatrix;
}

/** Head-to-head comparison across all tools for all datasets. */
export interface ComparisonMatrix {
  datasets: string[];
  tools: string[];
  /** rows[dataset][tool] = { f1, precision, recall, timeMeanMs } */
  rows: Record<string, Record<string, ComparisonCell>>;
}

export interface ComparisonCell {
  f1: number;
  f1StdDev: number;
  precision: number;
  recall: number;
  timeMeanMs: number;
}
