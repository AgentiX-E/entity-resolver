// Data preprocessing pipeline for entity-resolver.
// Provides Unicode repair (ftfy-equivalent), CJK normalization,
// and field-type-aware cleaning.

// ═══════════════════════════════════════════════════════════════
// Unicode repair — Western confusables + mojibake
// ═══════════════════════════════════════════════════════════════

/** Unicode replacement character. */
const REPLACEMENT_CHAR = '\uFFFD';

/** Common Unicode confusables map (ftfy-inspired). */
const UNICODE_FIXES: Readonly<Record<string, string>> = Object.freeze({
  '\u2018': "'", '\u2019': "'",
  '\u201C': '"', '\u201D': '"',
  '\u2013': '-', '\u2014': '--',
  '\u00A0': ' ', '\u2026': '...',
  '\u00AD': '',  '\u200B': '',
  '\uFEFF': '',  '\u2122': '(TM)',
  '\u00AE': '(R)',
});

/** Moji-bake (garbled text) repair patterns. */
const MOJIBAKE_PATTERNS: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /Ã©/g, replacement: 'é' }, { pattern: /Ã¨/g, replacement: 'è' },
  { pattern: /Ã«/g, replacement: 'ë' }, { pattern: /Ã¼/g, replacement: 'ü' },
  { pattern: /Ã¶/g, replacement: 'ö' }, { pattern: /Ã¤/g, replacement: 'ä' },
  { pattern: /Ã /g, replacement: 'à' },  { pattern: /Ã§/g, replacement: 'ç' },
  { pattern: /Ã±/g, replacement: 'ñ' },
  { pattern: /â\u0080\u0099/g, replacement: "'" },
  { pattern: /â\u0080\u009C/g, replacement: '"' },
  { pattern: /â\u0080\u009D/g, replacement: '"' },
  { pattern: /â\u0080\u0093/g, replacement: '-' },
  { pattern: /â\u0080\u0094/g, replacement: '--' },
];

/** Characters to strip for normalization. */
const STRIP_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Repair common Unicode issues in a string (ftfy-equivalent).
 */
export function repairUnicode(input: string): string {
  let result = input.replaceAll(REPLACEMENT_CHAR, '');
  for (const { pattern, replacement } of MOJIBAKE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  for (const [bad, good] of Object.entries(UNICODE_FIXES)) {
    result = result.replaceAll(bad, good);
  }
  return result.replace(STRIP_CHARS, '').trim();
}

// ═══════════════════════════════════════════════════════════════
// CJK Normalization
// ═══════════════════════════════════════════════════════════════

/** Fullwidth ASCII range: U+FF01–U+FF5E → U+0021–U+007E */
const FULLWIDTH_OFFSET = 0xFF01 - 0x0021;

/** Fullwidth space → halfwidth space. */
const FULLWIDTH_SPACE = '\u3000';

/** Katakana → Hiragana shift (U+30A1–U+30F6 → U+3041–U+3096). */
const KATAKANA_SHIFT = 0x30A1 - 0x3041;

/**
 * Normalize CJK text for entity resolution.
 *
 * Operations (in order):
 * 1. NFKC normalization — decomposes compatibility characters
 * 2. Fullwidth ASCII → halfwidth ASCII
 * 3. Fullwidth space → halfwidth space
 * 4. Katakana → Hiragana
 * 5. Fullwidth digits → halfwidth digits
 *
 * This ensures that:
 * - "Ｍｉｃｒｏｓｏｆｔ" matches "Microsoft"
 * - "株式会社" written in halfwidth matches fullwidth
 * - "コンピュータ" (katakana) matches "こんぴゅーた" (hiragana, after normalization)
 *
 * @param value — string to normalize
 * @returns CJK-normalized string
 */
export function normalizeCJK(value: string): string {
  let result = value;

  // Step 1: NFKC normalization (handles most CJK compatibility chars)
  result = result.normalize('NFKC');

  // Step 2: Fullwidth ASCII → halfwidth ASCII
  let mapped = '';
  for (let i = 0; i < result.length; i++) {
    const cp = result.codePointAt(i)!;
    if (cp >= 0xFF01 && cp <= 0xFF5E) {
      mapped += String.fromCodePoint(cp - FULLWIDTH_OFFSET);
    } else if (cp >= 0xFFE0 && cp <= 0xFFE6) {
      // Fullwidth currency/symbol range → halfwidth
      mapped += String.fromCodePoint(cp - 0xFFE0 + 0x00A2);
    } else if (result[i] === FULLWIDTH_SPACE) {
      mapped += ' ';
    } else if (cp > 0xFFFF) {
      mapped += result[i]! + (result[i + 1] ?? '');
      i++;
    } else {
      mapped += result[i]!;
    }
  }
  result = mapped;

  // Step 3: Katakana → Hiragana (common in Japanese text)
  mapped = '';
  for (let i = 0; i < result.length; i++) {
    const cp = result.codePointAt(i)!;
    if (cp >= 0x30A1 && cp <= 0x30F6) {
      mapped += String.fromCodePoint(cp - KATAKANA_SHIFT);
    } else if (cp > 0xFFFF) {
      mapped += result[i]! + (result[i + 1] ?? '');
      i++;
    } else {
      mapped += result[i]!;
    }
  }
  result = mapped;

  // Step 4: Strip control characters + trim
  return result.replace(STRIP_CHARS, '').trim();
}

// ═══════════════════════════════════════════════════════════════
// Public normalization API
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a string value for comparison:
 * - Unicode repair (confusables, mojibake)
 * - CJK normalization (NFKC, fullwidth, katakana)
 * - Lowercase + whitespace collapse
 */
export function normalize(value: unknown): string {
  const str = String(value ?? '');
  const repaired = repairUnicode(str);
  const cjkNormalized = normalizeCJK(repaired);
  return cjkNormalized.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalize an email address.
 */
export function normalizeEmail(value: unknown): string {
  const str = String(value ?? '').trim().toLowerCase();
  if (!str.includes('@')) return str;
  const [local, domain] = str.split('@') as [string, string];
  const cleanLocal = local.replace(/\./g, '');
  return `${cleanLocal}@${domain}`;
}

/**
 * Normalize a phone number — strip non-digits.
 */
export function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Apply preprocessing to a batch of records in-place.
 */
export function preprocessRecords(
  records: Record<string, unknown>[],
  options?: {
    readonly emailFields?: readonly string[];
    readonly phoneFields?: readonly string[];
  },
): void {
  const { emailFields = [], phoneFields = [] } = options ?? {};
  for (const record of records) {
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (typeof value !== 'string') continue;
      if (emailFields.includes(key)) {
        record[key] = normalizeEmail(value);
      } else if (phoneFields.includes(key)) {
        record[key] = normalizePhone(value);
      } else {
        record[key] = normalize(value);
      }
    }
  }
}
