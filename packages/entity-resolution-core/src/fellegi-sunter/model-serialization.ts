// Model serialization — persistence for FS parameters, scorer config, and blocking rules.
// Enables save/load of trained models for production deployment without re-training.

import type { FSParameters } from '../fellegi-sunter/parameters.js';
import { validateParameters } from '../fellegi-sunter/parameters.js';
import type { EMResult } from '../fellegi-sunter/em.js';
import type { ComparisonSpec } from '../matching/comparison.js';
import type { BlockingConfig, BlockingPass } from '../blocking/types.js';

// ─── Versioned model format ─────────────────────────────────────

/** Current model format version. Increment on breaking schema changes. */
export const MODEL_VERSION = '1.0.0';

/** Full serializable model snapshot. */
export interface SerializedModel {
  /** Schema version for forward/backward compatibility. */
  readonly version: string;
  /** When the model was serialized (ISO 8601). */
  readonly serializedAt: string;
  /** Package version that produced this model. */
  readonly producedBy: string;
  /** Fellegi-Sunter parameters. */
  readonly parameters: SerializedFSParameters;
  /** Comparison specs used during training. */
  readonly comparisons: readonly SerializedComparisonSpec[];
  /** Blocking configuration used during training. */
  readonly blocking: SerializedBlockingConfig;
  /** Match threshold used for clustering. */
  readonly matchThreshold: number;
}

interface SerializedFSParameters {
  readonly lambda: number;
  readonly mProbabilities: Record<string, number>;
  readonly uProbabilities: Record<string, number>;
}

interface SerializedComparisonSpec {
  readonly field: string;
  readonly scorerName: string;
  readonly levels: readonly { readonly label: string; readonly threshold: number }[];
}

interface SerializedBlockingConfig {
  readonly passes: readonly {
    readonly fields: readonly string[];
    readonly transforms: readonly string[];
  }[];
}

/** Result of deserialization with validation. */
export interface DeserializedModel {
  /** Whether validation passed. */
  readonly valid: boolean;
  /** The model if valid, undefined otherwise. */
  readonly model?: SerializedModel;
  /** Validation errors if any. */
  readonly errors: readonly string[];
}

// ─── Serialization ───────────────────────────────────────────────

/**
 * Serialize a trained model to a JSON string for persistence.
 *
 * Captures FS parameters, comparison specs, blocking config,
 * and metadata (version, timestamp) for reproducibility.
 */
export function serializeModel(
  emResult: EMResult,
  comparisons: readonly ComparisonSpec[],
  blocking: BlockingConfig,
  matchThreshold: number,
): string {
  const model: SerializedModel = {
    version: MODEL_VERSION,
    serializedAt: new Date().toISOString(),
    producedBy: '0.1.0',
    parameters: serializeFSParams(emResult.parameters),
    comparisons: comparisons.map(serializeComparisonSpec),
    blocking: serializeBlockingConfig(blocking),
    matchThreshold,
  };

  return JSON.stringify(model, null, 2);
}

/**
 * Serialize just the FS parameters (lightweight option).
 */
export function serializeFSParamsToJSON(params: FSParameters): string {
  return JSON.stringify(serializeFSParams(params));
}

// ─── Deserialization ─────────────────────────────────────────────

/**
 * Deserialize a model from a JSON string with full validation.
 *
 * Validates schema version, parameter ranges, and structural integrity.
 * Returns a DeserializedModel with explicit success/failure.
 */
export function deserializeModel(json: string): DeserializedModel {
  const errors: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { valid: false, errors: [`Invalid JSON: ${String(e)}`] };
  }

  if (!isRecord(raw)) {
    return { valid: false, errors: ['Root must be an object'] };
  }

  // Version check
  if (typeof raw.version !== 'string') {
    errors.push('Missing or invalid "version" field');
  }

  // Parameters validation
  if (!isRecord(raw.parameters)) {
    errors.push('Missing "parameters" object');
  } else {
    const paramErrors = validateSerializedFSParams(raw.parameters);
    errors.push(...paramErrors);
  }

  // Comparisons validation
  if (!Array.isArray(raw.comparisons)) {
    errors.push('Missing or invalid "comparisons" array');
  } else {
    for (let i = 0; i < raw.comparisons.length; i++) {
      const comp = raw.comparisons[i];
      if (!isRecord(comp)) {
        errors.push(`comparisons[${i}]: must be an object`);
        continue;
      }
      if (typeof comp.field !== 'string') errors.push(`comparisons[${i}]: missing "field"`);
      if (typeof comp.scorerName !== 'string') errors.push(`comparisons[${i}]: missing "scorerName"`);
      if (!Array.isArray(comp.levels)) errors.push(`comparisons[${i}]: missing "levels" array`);
      else {
        for (let j = 0; j < comp.levels.length; j++) {
          const lvl = comp.levels[j];
          if (!isRecord(lvl) || typeof lvl.label !== 'string' || typeof lvl.threshold !== 'number') {
            errors.push(`comparisons[${i}].levels[${j}]: invalid level`);
          }
        }
      }
    }
  }

  // Blocking validation
  if (!isRecord(raw.blocking) || !Array.isArray(raw.blocking.passes)) {
    errors.push('Missing or invalid "blocking" config');
  }

  if (typeof raw.matchThreshold !== 'number' || raw.matchThreshold < 0 || raw.matchThreshold > 1) {
    errors.push('matchThreshold must be a number in [0, 1]');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, model: raw as unknown as SerializedModel, errors: [] };
}

/**
 * Deserialize FS parameters from a JSON string.
 * Throws if validation fails.
 */
export function deserializeFSParamsFromJSON(json: string): FSParameters {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${String(e)}`);
  }

  if (!isRecord(raw)) {
    throw new Error('Parameters must be a JSON object');
  }

  const errors = validateSerializedFSParams(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid FS parameters: ${errors.join('; ')}`);
  }

  const params: FSParameters = {
    lambda: Number(raw.lambda),
    mProbabilities: new Map(Object.entries(raw.mProbabilities as Record<string, number> ?? {})),
    uProbabilities: new Map(Object.entries(raw.uProbabilities as Record<string, number> ?? {})),
  };

  validateParameters(params);
  return params;
}

// ─── Internal helpers ────────────────────────────────────────────

function serializeFSParams(params: FSParameters): SerializedFSParameters {
  return {
    lambda: params.lambda,
    mProbabilities: Object.fromEntries(params.mProbabilities),
    uProbabilities: Object.fromEntries(params.uProbabilities),
  };
}

function serializeComparisonSpec(spec: ComparisonSpec): SerializedComparisonSpec {
  return {
    field: spec.field,
    scorerName: spec.scorerName,
    levels: spec.levels.map((l) => ({ label: l.label, threshold: l.threshold })),
  };
}

function serializeBlockingConfig(config: BlockingConfig): SerializedBlockingConfig {
  return {
    passes: (config.passes ?? []).map((p: BlockingPass) => ({
      fields: [...p.fields],
      transforms: [...p.transforms],
    })),
  };
}

function validateSerializedFSParams(raw: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (typeof raw.lambda !== 'number' || raw.lambda <= 0 || raw.lambda >= 1) {
    errors.push('parameters.lambda must be a number in (0, 1)');
  }

  if (!isRecord(raw.mProbabilities)) {
    errors.push('parameters.mProbabilities must be a record of string→number');
  } else {
    for (const [key, val] of Object.entries(raw.mProbabilities)) {
      if (typeof val !== 'number' || val < 0 || val > 1) {
        errors.push(`parameters.mProbabilities["${key}"]: must be in [0, 1]`);
      }
    }
  }

  if (!isRecord(raw.uProbabilities)) {
    errors.push('parameters.uProbabilities must be a record of string→number');
  } else {
    for (const [key, val] of Object.entries(raw.uProbabilities)) {
      if (typeof val !== 'number' || val < 0 || val > 1) {
        errors.push(`parameters.uProbabilities["${key}"]: must be in [0, 1]`);
      }
    }
  }

  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
