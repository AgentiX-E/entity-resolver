// IScorer interface — the scoring abstraction for entity-resolution.
// Implementations: pure JS (scorers/js/) and WASM (scorers/wasm/).

import type { FieldMetadata } from '../types/core.js';

/**
 * A scoring function that computes similarity between two field values.
 * All implementations return a score in [0, 1] where 1.0 means perfect match.
 *
 * Implemented by:
 *   - Pure JS scorers (scorers/js/) — always available
 *   - WASM scorers (scorers/wasm/) — auto-detected, ~5x faster
 */
export interface IScorer {
  /** Unique name of this scorer (e.g., "levenshtein", "jaro_winkler"). */
  readonly name: string;

  /**
   * Compute similarity between two field values.
   * @returns A score in [0, 1]. 1.0 = perfect match, 0.0 = completely different.
   * @throws Never — scorers must handle all input gracefully and return 0 for edge cases.
   */
  score(a: unknown, b: unknown, field: FieldMetadata): number;

  /** Whether this scorer uses WASM acceleration (false for pure JS). */
  readonly kernelized: boolean;
}

/** Factory type for creating scorers. */
export type ScorerFactory = () => IScorer;
