/**
 * PatternRegistry — Extensible pattern matching engine for entity extraction.
 *
 * Architecture:
 *   Inspired by spaCy's EntityRuler, PatternRegistry provides a hybrid rule-based
 *   matching system. Each registered pattern consists of:
 *   - A named matcher function that takes text and returns extracted values
 *   - Optional priority for disambiguation
 *   - A field type name for schema-driven auto-configuration
 *
 * Usage:
 *   const registry = new PatternRegistry();
 *   registry.register('email', emailMatcher, { priority: 10 });
 *   const result = registry.extract('email', 'contact@example.com');
 *
 * The registry is extensible — users can register custom patterns at runtime.
 * Built-in patterns are pre-registered at module load time via registerBuiltins().
 */

export interface PatternMatcher {
  /** Human-readable name for diagnostics */
  name: string;
  /**
   * Attempt to extract the target value from text.
   * Returns an array of candidate matches with confidence scores.
   * Returns empty array if no match found.
   */
  extract: (text: string) => PatternMatch[];
}

export interface PatternMatch {
  /** The extracted value in its native type (string, number, boolean, Date) */
  value: unknown;
  /** Confidence score [0, 1] */
  confidence: number;
  /** The raw substring that matched */
  matchedText: string;
  /** Character offset in the original text */
  offset: number;
}

export interface PatternRegistration {
  matcher: PatternMatcher;
  priority: number;
}

/**
 * PatternRegistry — Central registry for field-type → matcher mappings.
 *
 * Each field type (e.g. 'email', 'phone', 'date') maps to one PatternMatcher.
 * The registry supports registration, query, and batch extraction against all
 * registered types.
 */
export class PatternRegistry {
  private readonly matchers = new Map<string, PatternRegistration>();

  /**
   * Register a pattern matcher for a field type.
   * Higher priority matchers are tried first during ambiguous extractions.
   */
  register(fieldType: string, matcher: PatternMatcher, priority = 0): void {
    if (this.matchers.has(fieldType)) {
      // Replace only if the new matcher has higher priority
      const existing = this.matchers.get(fieldType)!;
      if (priority <= existing.priority) {
        return;
      }
    }
    this.matchers.set(fieldType, { matcher, priority });
  }

  /**
   * Check whether a matcher is registered for the given field type.
   */
  has(fieldType: string): boolean {
    return this.matchers.has(fieldType);
  }

  /**
   * Get the registered matcher for a field type, or undefined.
   */
  get(fieldType: string): PatternMatcher | undefined {
    return this.matchers.get(fieldType)?.matcher;
  }

  /**
   * Attempt to extract a value from text using the registered matcher.
   * Returns the best match (highest confidence) or null if no match.
   */
  extract(fieldType: string, text: string): PatternMatch | null {
    const registration = this.matchers.get(fieldType);
    if (!registration) return null;

    const matches = registration.matcher.extract(text);
    if (matches.length === 0) return null;

    // Return the match with the highest confidence
    return matches.reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );
  }

  /**
   * Extract values for all registered field types from the given text.
   * Returns a map of fieldType → best match.
   */
  extractAll(text: string): Map<string, PatternMatch> {
    const results = new Map<string, PatternMatch>();
    for (const [fieldType] of this.matchers) {
      const match = this.extract(fieldType, text);
      if (match) {
        results.set(fieldType, match);
      }
    }
    return results;
  }

  /**
   * List all registered field types.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.matchers.keys());
  }

  /**
   * Number of registered matchers.
   */
  get size(): number {
    return this.matchers.size;
  }

  /**
   * Remove all registered matchers (useful for testing).
   */
  clear(): void {
    this.matchers.clear();
  }
}
