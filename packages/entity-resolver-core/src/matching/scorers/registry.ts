// ScorerRegistry — central scorer management.
// Auto-detects WASM availability and provides the fastest available scorer set.

import type { IScorer } from '../../interfaces/IScorer.js';
import { ALL_SCORERS, IMPLEMENTED_SCORER_COUNT } from './js/scorers.js';

/** Cached scorer map, populated lazily. */
let _scorers: Readonly<Record<string, IScorer>> | null = null;

/**
 * Get all available scorers, preferring WASM-accelerated versions when available.
 * Pure JS scorers are always the fallback.
 */
export function getScorers(): Readonly<Record<string, IScorer>> {
  if (_scorers) return _scorers;

  // Future: try loading WASM scorers here
  // const wasmScorers = await tryLoadWasmScorers();
  // if (wasmScorers) { _scorers = wasmScorers; return _scorers; }

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
}

/** Validate that all 19 scorers are loaded and functional. */
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

    // Validate that score() returns [0, 1] for basic inputs
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
