// Data preprocessing pipeline for entity-resolution.
// Provides Unicode repair (ftfy-equivalent), normalization, and cleaning.

/** Unicode replacement character. */
const REPLACEMENT_CHAR = '\uFFFD';

/** Common Unicode confusables map (ftfy-inspired). */
const UNICODE_FIXES: Readonly<Record<string, string>> = Object.freeze({
  '\u2018': "'", // Left single quote
  '\u2019': "'", // Right single quote
  '\u201C': '"', // Left double quote
  '\u201D': '"', // Right double quote
  '\u2013': '-', // En dash
  '\u2014': '--', // Em dash
  '\u00A0': ' ', // Non-breaking space
  '\u2026': '...', // Horizontal ellipsis
  '\u00AD': '', // Soft hyphen
  '\u200B': '', // Zero-width space
  '\uFEFF': '', // BOM / zero-width no-break space
  '\u2122': '(TM)', // Trademark
  '\u00AE': '(R)', // Registered
});

/** Moji-bake (garbled text) repair patterns. */
const MOJIBAKE_PATTERNS: Readonly<
  Array<{
    pattern: RegExp;
    replacement: string;
  }>
> = [
  // Common UTF-8 mis-decoded as Latin-1
  { pattern: /Ã©/g, replacement: 'é' },
  { pattern: /Ã¨/g, replacement: 'è' },
  { pattern: /Ã«/g, replacement: 'ë' },
  { pattern: /Ã¼/g, replacement: 'ü' },
  { pattern: /Ã¶/g, replacement: 'ö' },
  { pattern: /Ã¤/g, replacement: 'ä' },
  { pattern: /Ã /g, replacement: 'à' },
  { pattern: /Ã§/g, replacement: 'ç' },
  { pattern: /Ã±/g, replacement: 'ñ' },
  // Common Windows-1252 mis-decoded
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
 * - Replaces smart quotes, dashes, and other confusables
 * - Fixes common mojibake (UTF-8 mis-decoded as Latin-1)
 * - Removes control characters
 * - Strips leading/trailing whitespace
 *
 * @returns The repaired string.
 */
export function repairUnicode(input: string): string {
  let result = input;

  // Step 1: Remove replacement characters (already corrupted)
  result = result.replaceAll(REPLACEMENT_CHAR, '');

  // Step 2: Fix mojibake patterns
  for (const { pattern, replacement } of MOJIBAKE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // Step 3: Replace confusable Unicode characters
  for (const [bad, good] of Object.entries(UNICODE_FIXES)) {
    result = result.replaceAll(bad, good);
  }

  // Step 4: Strip control characters
  result = result.replace(STRIP_CHARS, '');

  return result.trim();
}

/**
 * Normalize a string value for comparison:
 * - Repair Unicode
 * - Convert to lowercase
 * - Collapse whitespace
 */
export function normalize(value: unknown): string {
  const str = String(value ?? '');
  const repaired = repairUnicode(str);
  return repaired.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalize an email address:
 * - Lowercase
 * - Strip whitespace
 * - Remove trailing dots in local part (Gmail-specific)
 */
export function normalizeEmail(value: unknown): string {
  const str = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!str.includes('@')) return str;
  const [local, domain] = str.split('@') as [string, string];
  // Gmail ignores dots in the local part
  const cleanLocal = local.replace(/\./g, '');
  return `${cleanLocal}@${domain}`;
}

/**
 * Normalize a phone number:
 * - Strip all non-digit characters
 */
export function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Apply preprocessing to a batch of records.
 * Each record's string fields are repaired and normalized in-place.
 */
export function preprocessRecords(
  records: Array<Record<string, unknown>>,
  options?: {
    /** Fields to treat as email addresses. */
    readonly emailFields?: readonly string[];
    /** Fields to treat as phone numbers. */
    readonly phoneFields?: readonly string[];
  },
): void {
  const { emailFields = [], phoneFields = [] } = options ?? {};

  for (const record of records) {
    const keys = Object.keys(record);
    for (const key of keys) {
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
