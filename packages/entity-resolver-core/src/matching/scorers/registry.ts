// ScorerRegistry — central scorer management.
// Auto-detects WASM availability and provides the fastest available scorer set.

import type { IScorer } from '../../interfaces/IScorer.js';
import type { ILogger } from '../../interfaces/ILogger.js';
import { ALL_SCORERS, IMPLEMENTED_SCORER_COUNT } from './js/scorers.js';
import { tryLoadWasmScorers } from './wasm/loader.js';

/** Cached scorer map, populated lazily. */
let _scorers: Readonly<Record<string, IScorer>> | null = null;

/** Whether WASM scorers have been initialized. */
let _wasmInitialized = false;

/** Whether WASM scorers were successfully loaded. */
let _wasmActive = false;

/** Result of scorer initialization. */
export type ScorerInitResult = 'wasm' | 'js';

/**
 * Initialize scorers, preferring WASM-accelerated versions when available.
 *
 * Call once at application startup. If WASM binaries are available on the
 * current platform, ~5x faster Rust-compiled scorers replace the pure JS
 * versions. Falls back transparently to pure JS if WASM is unavailable.
 *
 * @returns 'wasm' if WASM scorers loaded, 'js' if pure JS fallback is used.
 */
export async function initScorers(logger?: ILogger): Promise<ScorerInitResult> {
  if (_wasmInitialized) return _wasmActive ? 'wasm' : 'js';

  try {
    const wasmScorers = await tryLoadWasmScorers(logger);
    if (wasmScorers && Object.keys(wasmScorers).length > 0) {
      // Merge WASM scorers with JS fallback: WASM takes priority,
      // keeping pure JS scorers for names not in the WASM set
      _scorers = { ...ALL_SCORERS, ...wasmScorers };
      _wasmInitialized = true;
      _wasmActive = true;
      return 'wasm';
    }
  } catch (err: unknown) {
    // WASM unavailable — fall through to pure JS (graceful degradation)
    logger?.warn(
      `WASM scorer initialization failed — using pure JS fallback: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  _scorers = ALL_SCORERS;
  _wasmInitialized = true;
  _wasmActive = false;
  return 'js';
}

/**
 * Get all available scorers.
 *
 * If `initScorers()` was called, WASM-accelerated versions are preferred
 * for supported names (levenshtein, jaro, jaro_winkler, dice, soundex).
 * Falls back to pure JS scorers if WASM initialization has not been called
 * or failed.
 */
export function getScorers(): Readonly<Record<string, IScorer>> {
  if (_scorers) return _scorers;

  // Lazy-initialize with pure JS scorers (no WASM auto-detect).
  // Call initScorers() explicitly at startup for WASM acceleration.
  _scorers = ALL_SCORERS;
  return _scorers;
}

/**
 * Get a single scorer by name.
 * @throws If the scorer name is not registered.
 */
export function getScorer(name: string): IScorer {
  const scorers = getScorers();
  const scorer = scorers[name];
  if (!scorer) {
    throw new Error(`Unknown scorer: "${name}". Available: ${Object.keys(scorers).join(', ')}`);
  }
  return scorer;
}

/** Number of scorers currently loaded. */
export function scorerCount(): number {
  return Object.keys(getScorers()).length;
}

/** Reset the scorer cache (for testing). */
export function resetScorerCache(): void {
  _scorers = null;
  _wasmInitialized = false;
  _wasmActive = false;
}

/** Validate that all scorers are loaded and functional. */
export function validateScorerRegistry(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const scorers = getScorers();
  const names = Object.keys(scorers);

  if (names.length < IMPLEMENTED_SCORER_COUNT) {
    errors.push(`Expected ${IMPLEMENTED_SCORER_COUNT} scorers, found ${names.length}`);
  }

  for (const [name, scorer] of Object.entries(scorers)) {
    if (!scorer.name || scorer.name !== name) {
      errors.push(`Scorer "${name}" has mismatched name: "${scorer.name}"`);
    }

    const testVal = 'test';
    const result = scorer.score(testVal, testVal, {
      name: 'test_field',
      semanticType: 'string',
      cardinality: 1,
      isNumeric: false,
    });
    if (typeof result !== 'number' || result < 0 || result > 1) {
      errors.push(`Scorer "${name}" returned invalid score ${result} for identical inputs`);
    }
  }

  return { valid: errors.length === 0, errors };
}
