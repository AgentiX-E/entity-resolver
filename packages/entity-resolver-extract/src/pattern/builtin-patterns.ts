/**
 * Built-in pattern matchers for common field types.
 *
 * Each matcher implements the PatternMatcher interface and provides
 * regex-based extraction with confidence scoring.
 *
 * Field types covered:
 *   email, phone, url, number, integer, boolean, date, datetime, time
 *
 * Each matcher is designed to:
 *   1. Find the best candidate in the text (first-strongest-match heuristic)
 *   2. Return the extracted value in its native type (string/number/boolean/Date)
 *   3. Provide a calibrated confidence score
 *
 * Confidence scoring guidelines:
 *   0.95+  �? Unambiguous match with strict format validation
 *   0.80-0.94 �? Good match with minor ambiguity
 *   0.60-0.79 �? Probable match with format heuristics
 *   0.40-0.59 �? Weak match, may need ONNX/LLM verification
 *   <0.40   �? Not returned (treated as no match)
 */

import type { PatternMatch, PatternMatcher } from './pattern-registry.js';

// ─── Email ───────────────────────────────────────────────────────────

const emailRegex =
  /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}\b/;

/**
 * RFC 5322 simplified email matcher.
 * Strips surrounding punctuation and angle brackets.
 * Confidence: 0.95 for valid-looking emails, 0.80 for borderline cases.
 */
const emailMatcher: PatternMatcher = {
  name: 'email',
  extract(text: string): PatternMatch[] {
    const match = emailRegex.exec(text);
    if (!match) return [];

    const raw = match[0];
    // Penalize disposable domains and suspicious TLDs lightly
    const disposableDomains = /@(?:example\.(?:com|org|net)|test\.com|email\.com)$/i;
    const confidence = disposableDomains.test(raw) ? 0.8 : 0.95;

    return [
      {
        value: raw.toLowerCase(),
        confidence,
        matchedText: raw,
        offset: match.index,
      },
    ];
  },
};

// ─── Phone ───────────────────────────────────────────────────────────

/**
 * International and Chinese phone number patterns.
 * Matches: +86-138-0000-0000, 13800000000, (010) 1234-5678, 1-800-555-0199
 * Uses regex-based heuristics �? TODO(I16): integrate libphonenumber-js for validation.
 */
const phoneRegex =
  /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{1,4}\)?[-.\s]?)?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{3,10}\b/;

const phoneMatcher: PatternMatcher = {
  name: 'phone',
  extract(text: string): PatternMatch[] {
    const match = phoneRegex.exec(text);
    if (!match) return [];

    const raw = match[0];
    // Basic heuristics: must have at least 7 digits
    const digitCount = (raw.match(/\d/g) ?? []).length;
    if (digitCount < 7) return [];

    // Confidence based on digit count and format
    let confidence = 0.7;
    if (digitCount >= 10 && digitCount <= 15) confidence = 0.9;
    if (raw.startsWith('+')) confidence += 0.05;

    return [
      {
        value: raw.replace(/\s+/g, ' ').trim(),
        confidence: Math.min(confidence, 1.0),
        matchedText: raw,
        offset: match.index,
      },
    ];
  },
};

// --- URL ---

const urlMatcher: PatternMatcher = {
  name: 'url',
  extract(text: string): PatternMatch[] {
    // Find the best URL match, skipping email-like patterns.
    // The global regex iterates all matches to find one without '@' ambiguity.
    const regex =
      /\b(?:(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*))/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0];
      // Skip email-ambiguous matches (contains '@' without protocol prefix)
      if (raw.includes('@') && !/^https?:\/\//i.test(raw)) continue;

      const hasProtocol = /^https?:\/\//i.test(raw);
      return [
        {
          value: hasProtocol ? raw : `https://${raw}`,
          confidence: hasProtocol ? 0.95 : 0.85,
          matchedText: raw,
          offset: match.index,
        },
      ];
    }
    return [];
  },
};

// ─── Number ──────────────────────────────────────────────────────────

/**
 * Matches integer and floating-point numbers.
 * Supports: negative numbers, decimals, scientific notation, currency symbols,
 * percentage signs, thousand separators (both ',' and space).
 */
const numberRegex =
  /(?:^|(?<=\s)|(?<=\()|(?<=#))(?:[+-]\s*)?(?:\p{Sc}\s*)?\d+(?:[,\s]\d{3})*(?:\.\d+)?(?:[eE][+-]?\d+)?\s*%?\s*(?:\p{Sc})?/u;

const integerRegex = /(?:^|(?<=\s)|(?<=\()|(?<=#))[+-]?\d+(?:[,\s]\d{3})*(?!\.\d)\b/;

/** Matches a standalone integer (no decimal part), stripping formatting. */
const integerMatcher: PatternMatcher = {
  name: 'integer',
  extract(text: string): PatternMatch[] {
    const match = integerRegex.exec(text);
    if (!match) return [];

    const raw = match[0].trim();
    const cleaned = raw.replace(/[,_\s]/g, '');
    const parsed = parseInt(cleaned, 10);

    if (isNaN(parsed)) return [];

    return [
      {
        value: parsed,
        confidence: 0.95,
        matchedText: raw,
        offset: match.index,
      },
    ];
  },
};

/** Matches any number (integer, float, scientific, currency, percentage). */
const numberMatcher: PatternMatcher = {
  name: 'number',
  extract(text: string): PatternMatch[] {
    const match = numberRegex.exec(text);
    if (!match) return [];

    const raw = match[0].trim();

    // Check for percentage
    const isPercent = raw.includes('%');
    // Check for currency
    const hasCurrency = /\p{Sc}/u.test(raw);

    // Clean formatting
    const cleaned = raw
      .replace(/[,_\s]/g, '')
      .replace(/[%]/g, '')
      .replace(/\p{Sc}/gu, '')
      .trim();

    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return [];

    let value: unknown = parsed;
    if (isPercent) value = parsed / 100;
    // Currency is returned as number �? caller can apply currency context

    let confidence = 0.9;
    if (hasCurrency) confidence = 0.92;
    if (isPercent) confidence = 0.95;
    if (/[eE][+-]?\d+/.test(cleaned)) confidence = 0.88; // scientific notation

    return [
      {
        value,
        confidence,
        matchedText: raw,
        offset: match.index,
      },
    ];
  },
};

// ─── Boolean ─────────────────────────────────────────────────────────

/**
 * Multi-language boolean matcher.
 * English: true/false, yes/no, y/n, on/off, 1/0
 * Chinese: �?/�?, �?/�?, �?/�?, �?/�?, 开/�?
 */
const booleanPatterns: Array<{ pattern: RegExp; value: boolean; lang: string }> = [
  // English
  { pattern: /\b(?:true|yes|y|on)\b/i, value: true, lang: 'en' },
  { pattern: /\b(?:false|no|n|off)\b/i, value: false, lang: 'en' },
  // Chinese �� use hex escapes to avoid encoding issues with unicode chars
  { pattern: /(?:\u662f|\u5bf9|\u771f|\u6709|\u5f00)/u, value: true, lang: 'zh' },
  { pattern: /(?:\u5426|\u4e0d|\u9519|\u5047|\u65e0|\u6ca1|\u5173)/u, value: false, lang: 'zh' },
];

const booleanMatcher: PatternMatcher = {
  name: 'boolean',
  extract(text: string): PatternMatch[] {
    for (const { pattern, value } of booleanPatterns) {
      const match = pattern.exec(text);
      if (match) {
        // Higher confidence for unambiguous English true/false
        const isEnglish = /^[a-z]+$/i.test(match[0]);
        return [
          {
            value,
            confidence: isEnglish ? 0.95 : 0.85,
            matchedText: match[0],
            offset: match.index,
          },
        ];
      }
    }

    // Numeric boolean: standalone 1 or 0
    const numericBool = /\b([01])\b/.exec(text);
    if (numericBool && numericBool[1]) {
      return [
        {
          value: numericBool[1] === '1',
          confidence: 0.75,
          matchedText: numericBool[1],
          offset: numericBool.index,
        },
      ];
    }

    return [];
  },
};

// ─── Date ─────────────────────────────────────────────────────────────

/**
 * ISO 8601 and common date format matcher.
 * Formats: 2024-01-15, 2024/01/15, 15/01/2024, Jan 15 2024, January 15, 2024
 *
 * NOTE: CJK date parsing (2024�?1�?15�?, 明天, 下周�?) is handled by the temporal
 * parser in I14. This matcher covers Western date formats only.
 */
const dateRegexes: Array<{ pattern: RegExp; format: string }> = [
  { pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/, format: 'YYYY-MM-DD' },
  { pattern: /\b(\d{4})\/(\d{2})\/(\d{2})\b/, format: 'YYYY/MM/DD' },
  {
    pattern:
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
    format: 'MMM DD YYYY',
  },
  {
    pattern:
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\s+(\d{4})\b/i,
    format: 'DD MMM YYYY',
  },
];

const monthNames: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const dateMatcher: PatternMatcher = {
  name: 'date',
  extract(text: string): PatternMatch[] {
    // Try ISO 8601 formats first (unambiguous)
    const isoMatch = /\b(\d{4})-(\d{2})-(\d{2})(?:[Tt](\d{2}):(\d{2})(?::(\d{2}))?)?\b/.exec(text);
    if (isoMatch) {
      const [, year, month, day, hour, minute, second] = isoMatch;
      const dateStr = `${year}-${month}-${day}`;
      if (hour !== undefined) {
        const timeStr = `${hour ?? '00'}:${minute ?? '00'}:${second ?? '00'}`;
        return [
          {
            value: new Date(`${dateStr}T${timeStr}Z`),
            confidence: 0.98,
            matchedText: isoMatch[0],
            offset: isoMatch.index,
          },
        ];
      }
      return [
        {
          value: new Date(`${dateStr}T00:00:00Z`),
          confidence: 0.98,
          matchedText: isoMatch[0],
          offset: isoMatch.index,
        },
      ];
    }

    // Try slash format: YYYY/MM/DD
    const slashMatch = /\b(\d{4})\/(\d{2})\/(\d{2})\b/.exec(text);
    if (slashMatch) {
      const [, year, month, day] = slashMatch;
      return [
        {
          value: new Date(`${year}-${month}-${day}T00:00:00Z`),
          confidence: 0.95,
          matchedText: slashMatch[0],
          offset: slashMatch.index,
        },
      ];
    }

    // Try named month formats
    for (const { pattern, format } of dateRegexes.slice(2)) {
      // Only try the named-month patterns
      const match = pattern.exec(text);
      if (!match) continue;

      let year: string, month: string, day: string;
      if (format === 'MMM DD YYYY') {
        const monthKey = match[1]!.toLowerCase();
        month = String(monthNames[monthKey] ?? 1).padStart(2, '0');
        day = String(parseInt(match[2]!, 10)).padStart(2, '0');
        year = match[3]!;
      } else {
        // DD MMM YYYY
        day = String(parseInt(match[1]!, 10)).padStart(2, '0');
        const monthKey = match[2]!.toLowerCase();
        month = String(monthNames[monthKey] ?? 1).padStart(2, '0');
        year = match[3]!;
      }

      const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
      if (isNaN(parsed.getTime())) continue;

      return [
        {
          value: parsed,
          confidence: 0.9,
          matchedText: match[0],
          offset: match.index,
        },
      ];
    }

    return [];
  },
};

// ─── Time ─────────────────────────────────────────────────────────────

/**
 * Matches time expressions in 12h and 24h formats.
 * Formats: 14:30, 2:30 PM, 02:30:00, 2pm, 2:30:45
 */
const timeRegex = /\b(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm|AM|PM|上午|下午)?\b/;

const timeMatcher: PatternMatcher = {
  name: 'time',
  extract(text: string): PatternMatch[] {
    const match = timeRegex.exec(text);
    if (!match) return [];

    let hours = parseInt(match[1]!, 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    const ampm = match[4]?.toLowerCase();

    if (hours > 59) return []; // Not a valid time, likely a different kind of number

    // AM/PM adjustment
    if (ampm === 'pm' || ampm === '下午') {
      if (hours !== 12) hours += 12;
    } else if (ampm === 'am' || ampm === '上午') {
      if (hours === 12) hours = 0;
    }

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return [];
    }

    const timeStr =
      `${String(hours).padStart(2, '0')}:` +
      `${String(minutes).padStart(2, '0')}:` +
      `${String(seconds).padStart(2, '0')}`;

    let confidence = 0.85;
    if (ampm) confidence = 0.92;
    if (seconds > 0) confidence += 0.03;

    return [
      {
        value: timeStr,
        confidence: Math.min(confidence, 1.0),
        matchedText: match[0],
        offset: match.index,
      },
    ];
  },
};

// ─── Collection ──────────────────────────────────────────────────────

/** All built-in matchers, keyed by field type name */
export const builtinMatchers: Record<string, PatternMatcher> = {
  email: emailMatcher,
  phone: phoneMatcher,
  url: urlMatcher,
  number: numberMatcher,
  integer: integerMatcher,
  boolean: booleanMatcher,
  date: dateMatcher,
  time: timeMatcher,
};

/**
 * Register all built-in matchers into a PatternRegistry.
 * Call this once during initialization.
 */
export function registerBuiltins(registry: {
  register: (fieldType: string, matcher: PatternMatcher, priority?: number) => void;
}): void {
  for (const [fieldType, matcher] of Object.entries(builtinMatchers)) {
    registry.register(fieldType, matcher, 0);
  }
}
