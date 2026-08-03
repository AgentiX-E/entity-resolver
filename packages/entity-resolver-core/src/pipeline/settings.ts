/**
 * SettingsCreator — declarative pipeline configuration (I38).
 *
 * Inspired by Splink's SettingsCreator pattern: separate authoring
 * from execution, enable serialization, and provide a fluent API
 * for building entity resolution configurations.
 *
 * Design principles:
 *   1. SettingsCreator is a pure data builder — no side effects
 *   2. PipelineSettings is the serializable, validated snapshot
 *   3. Backward-compatible with existing PipelineConfig inline objects
 *   4. JSON round-trip is lossless (settings → JSON → settings)
 */

import type { BlockingPass } from '../blocking/types.js';
import type { ComparisonSpec } from '../matching/comparison.js';
import type { PipelineConfig } from '../pipeline/runner.js';
import type { RawRecord } from '../types/core.js';

// ═══════════════════════════════════════════════════════════════
// Link type — determines which pairs are compared
// ═══════════════════════════════════════════════════════════════

/** The type of entity resolution operation. */
export type LinkType = 'dedupe_only' | 'link_only' | 'link_and_dedupe';

// ═══════════════════════════════════════════════════════════════
// PipelineSettings — serializable, validated config snapshot
// ═══════════════════════════════════════════════════════════════

/** Immutable, serializable pipeline settings created by SettingsCreator. */
export interface PipelineSettings {
  /** Type of entity resolution operation. */
  readonly linkType: LinkType;
  /** Field comparisons with scorer + level configuration. */
  readonly comparisons: readonly ComparisonSpec[];
  /** Blocking rules for candidate pair generation. */
  readonly blockingRules: readonly BlockingPass[];
  /** Match probability threshold for clustering. */
  readonly matchThreshold: number;
  /** Fields eligible for term frequency adjustment. */
  readonly tfFields?: readonly string[];
  /** Unique ID column name in the input data. */
  readonly uniqueIdColumn?: string;
  /** EM convergence epsilon (default: 0.0001). */
  readonly emConvergence?: number;
  /** Maximum EM iterations (default: 25). */
  readonly maxIterations?: number;
  /** Estimated probability two random records match (default: 0.0001). */
  readonly probabilityTwoRandomRecordsMatch?: number;
}

// ═══════════════════════════════════════════════════════════════
// SettingsCreator — fluent builder API
// ═══════════════════════════════════════════════════════════════

/**
 * Builder for PipelineSettings with a fluent, self-documenting API.
 *
 * Usage:
 * ```typescript
 * const settings = new SettingsCreator('dedupe_only')
 *   .addComparison({ field: 'name', scorerName: 'ensemble', levels: [...] })
 *   .addBlockingRule({ fields: ['name'], transforms: ['lowercase'] })
 *   .withMatchThreshold(0.7)
 *   .build();
 * ```
 */
export class SettingsCreator {
  private _linkType: LinkType;
  private _comparisons: ComparisonSpec[] = [];
  private _blockingRules: BlockingPass[] = [];
  private _matchThreshold = 0.7;
  private _tfFields?: string[];
  private _uniqueIdColumn?: string;
  private _emConvergence?: number;
  private _maxIterations?: number;
  private _probabilityTwoRandomRecordsMatch?: number;

  /** Create a new SettingsCreator for the given link type. */
  constructor(linkType: LinkType) {
    this._linkType = linkType;
  }

  /** Add a field comparison specification. */
  addComparison(spec: ComparisonSpec): this {
    this._comparisons.push(spec);
    return this;
  }

  /** Add multiple comparison specs at once. */
  addComparisons(specs: readonly ComparisonSpec[]): this {
    this._comparisons.push(...specs);
    return this;
  }

  /** Add a blocking rule for candidate pair generation. */
  addBlockingRule(pass: BlockingPass): this {
    this._blockingRules.push(pass);
    return this;
  }

  /** Add multiple blocking rules at once. */
  addBlockingRules(passes: readonly BlockingPass[]): this {
    this._blockingRules.push(...passes);
    return this;
  }

  /** Set the match probability threshold. */
  withMatchThreshold(threshold: number): this {
    this._matchThreshold = threshold;
    return this;
  }

  /** Set the link type (useful for cloning and changing). */
  withLinkType(linkType: LinkType): this {
    this._linkType = linkType;
    return this;
  }

  /** Enable term frequency adjustment for the given fields. */
  withTermFrequencyAdjustment(fields: string[]): this {
    this._tfFields = fields;
    return this;
  }

  /** Set the unique ID column name. */
  withUniqueIdColumn(column: string): this {
    this._uniqueIdColumn = column;
    return this;
  }

  /** Set EM convergence epsilon. */
  withEmConvergence(epsilon: number): this {
    this._emConvergence = epsilon;
    return this;
  }

  /** Set maximum EM iterations. */
  withMaxIterations(iterations: number): this {
    this._maxIterations = iterations;
    return this;
  }

  /** Set estimated probability of two random records matching. */
  withProbabilityTwoRandomRecordsMatch(probability: number): this {
    this._probabilityTwoRandomRecordsMatch = probability;
    return this;
  }

  /**
   * Configure all settings from an auto-detection result.
   * Accepts the output of autoConfigure() for zero-config usage.
   */
  fromAutoConfig(autoResult: {
    readonly config: PipelineConfig;
  }): this {
    const cfg = autoResult.config;
    this._comparisons = [...cfg.comparisons];
    this._blockingRules = [...(cfg.blocking?.passes ?? [])];
    this._matchThreshold = cfg.matchThreshold ?? this._matchThreshold;
    if (cfg.tfFields) {
      this._tfFields = [...cfg.tfFields];
    }
    return this;
  }

  /**
   * Build an immutable PipelineSettings snapshot.
   * Validates that required fields are present.
   */
  build(): PipelineSettings {
    if (this._comparisons.length === 0) {
      throw new Error('SettingsCreator: at least one comparison is required. Use addComparison().');
    }
    if (this._blockingRules.length === 0) {
      throw new Error('SettingsCreator: at least one blocking rule is required. Use addBlockingRule().');
    }
    if (this._matchThreshold < 0 || this._matchThreshold > 1) {
      throw new Error(`SettingsCreator: matchThreshold must be in [0,1], got ${this._matchThreshold}`);
    }

    return {
      linkType: this._linkType,
      comparisons: this._comparisons,
      blockingRules: this._blockingRules,
      matchThreshold: this._matchThreshold,
      ...(this._tfFields && { tfFields: this._tfFields }),
      ...(this._uniqueIdColumn && { uniqueIdColumn: this._uniqueIdColumn }),
      ...(this._emConvergence !== undefined && { emConvergence: this._emConvergence }),
      ...(this._maxIterations !== undefined && { maxIterations: this._maxIterations }),
      ...(this._probabilityTwoRandomRecordsMatch !== undefined && {
        probabilityTwoRandomRecordsMatch: this._probabilityTwoRandomRecordsMatch,
      }),
    };
  }

  /** Serialize to JSON for persistence. */
  toJSON(): string {
    return JSON.stringify(this.build(), null, 2);
  }
}

// ═══════════════════════════════════════════════════════════════
// Conversion utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Convert PipelineSettings to the execution-layer PipelineConfig.
 * This enables seamless use of SettingsCreator output with the
 * existing runPipeline() / runSqlLinkage() entry points.
 */
export function toPipelineConfig(settings: PipelineSettings): PipelineConfig {
  const cfg = {
    blocking: { passes: settings.blockingRules },
    comparisons: settings.comparisons,
    matchThreshold: settings.matchThreshold,
    autoConfigure: false as const,
  } as PipelineConfig;
  if (settings.tfFields) {
    (cfg as any).tfFields = settings.tfFields;
  }
  return cfg;
}

/**
 * Create PipelineSettings from a legacy PipelineConfig.
 * Backward compatibility: existing configs work unchanged.
 */
export function fromPipelineConfig(
  config: PipelineConfig,
  linkType: LinkType = 'dedupe_only',
): PipelineSettings {
  return new SettingsCreator(linkType)
    .addComparisons(config.comparisons)
    .addBlockingRules(config.blocking?.passes ?? [])
    .withMatchThreshold(config.matchThreshold)
    .build();
}

/**
 * Deserialize PipelineSettings from JSON.
 * Supports round-trip: build() → toJSON() → fromJSON() → build()
 * produces identical settings.
 */
export function settingsFromJSON(json: string): PipelineSettings {
  const raw = JSON.parse(json) as Record<string, unknown>;

  const creator = new SettingsCreator(
    (raw.linkType as LinkType) ?? 'dedupe_only',
  );

  const comparisons = raw.comparisons as ComparisonSpec[] | undefined;
  if (comparisons) creator.addComparisons(comparisons);

  const blocking = raw.blockingRules as BlockingPass[] | undefined;
  if (blocking) creator.addBlockingRules(blocking);

  if (typeof raw.matchThreshold === 'number') {
    creator.withMatchThreshold(raw.matchThreshold);
  }
  if (Array.isArray(raw.tfFields)) {
    creator.withTermFrequencyAdjustment(raw.tfFields as string[]);
  }
  if (typeof raw.uniqueIdColumn === 'string') {
    creator.withUniqueIdColumn(raw.uniqueIdColumn);
  }
  if (typeof raw.emConvergence === 'number') {
    creator.withEmConvergence(raw.emConvergence);
  }
  if (typeof raw.maxIterations === 'number') {
    creator.withMaxIterations(raw.maxIterations);
  }

  return creator.build();
}

// ═══════════════════════════════════════════════════════════════
// Quick-start helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Create a SettingsCreator pre-configured for entity deduplication.
 * Shortcut for: new SettingsCreator('dedupe_only').
 */
export function dedupeSettings(): SettingsCreator {
  return new SettingsCreator('dedupe_only');
}

/**
 * Create a SettingsCreator pre-configured for record linkage.
 * Shortcut for: new SettingsCreator('link_only').
 */
export function linkageSettings(): SettingsCreator {
  return new SettingsCreator('link_only');
}

/**
 * Create a SettingsCreator with auto-detected configuration.
 * Analyzes the provided records and returns a pre-configured builder.
 */
export function autoSettings(records: readonly RawRecord[]): SettingsCreator {
  // Dynamic import to avoid circular dependency with auto-config module
  const { autoConfigure } = require('../auto-config/detector.js') as {
    autoConfigure: (r: readonly RawRecord[]) => { config: PipelineConfig };
  };
  const autoResult = autoConfigure(records);
  return new SettingsCreator('dedupe_only').fromAutoConfig(autoResult);
}
