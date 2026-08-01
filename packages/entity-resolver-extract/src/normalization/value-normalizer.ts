/**
 * ValueNormalizer — Delegates entity value normalization to entity-resolver-core.
 *
 * All normalization logic lives in @agentix-e/entity-resolver-core.
 * This module provides a thin wrapper for the extract package, ensuring:
 *   - Unicode repair (Mojibake, confusables, control characters)
 *   - CJK normalization (NFKC, fullwidth→halfwidth, katakana→hiragana)
 *   - Email/phone normalization
 *
 * Re-exports for convenience within the extract package.
 */

import {
  repairUnicode,
  normalizeCJK,
  normalize,
  normalizeEmail,
  normalizePhone,
} from '@agentix-e/entity-resolver-core';

export { repairUnicode, normalizeCJK, normalize, normalizeEmail, normalizePhone };

/**
 * Normalize input text for extraction.
 *
 * Applies the full normalization pipeline:
 *   1. Unicode repair (fix Mojibake, strip control characters)
 *   2. CJK normalization (fullwidth→halfwidth, etc.)
 *   3. Whitespace normalization
 *
 * @param text - Raw input text
 * @returns Normalized text ready for pattern matching
 */
export function normalizeText(text: string): string {
  return normalize(text);
}
