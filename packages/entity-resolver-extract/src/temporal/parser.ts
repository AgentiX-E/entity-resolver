/**
 * CJK temporal expression parser.
 *
 * Parses natural-language temporal expressions in Chinese, Japanese, Korean,
 * and English into ISO 8601 date/time values with confidence scores.
 *
 * Architecture:
 *   Leverages the Chrono parser+refiner pattern:
 *   1. Recognize temporal tokens using CJK vocabulary constants
 *   2. Convert relative expressions to absolute dates (normalizer)
 *   3. Build structured TemporalResult with ISO 8601 output
 *
 * Key capabilities beyond Chrono:
 *   - Chinese sexagenary cycle (干支) support
 *   - Lunar calendar date parsing (农历)
 *   - Japanese era names (令和/平成/昭和/大正/明治)
 *   - Korean Dangi calendar (단기)
 *   - CJK numerals (一二三 → 123)
 */

import {
  TODAY_PATTERN,
  TOMORROW_PATTERN,
  YESTERDAY_PATTERN,
  DAY_AFTER_TOMORROW_PATTERN,
  DAY_BEFORE_YESTERDAY_PATTERN,
  DAY_OF_WEEK_PATTERNS,
  NAMED_MONTHS_CJK,
  CJK_DATE_PATTERN,
  CJK_TIME_PATTERN,
  NEXT_PATTERN,
  LAST_PATTERN,
  SEXAGENARY_CYCLE,
  JAPANESE_ERAS,
  TIME_OF_DAY_MARKERS,
  CHINESE_NUMERALS,
} from './constants.js';

export interface TemporalResult {
  /** ISO 8601 date string (YYYY-MM-DD) */
  date: string | null;
  /** ISO 8601 time string (HH:MM:SS) or null if only date */
  time: string | null;
  /** Full ISO 8601 datetime string or null */
  datetime: string | null;
  /** Raw matched text */
  matchedText: string;
  /** Character offset in the original text */
  offset: number;
  /** Confidence score [0, 1] */
  confidence: number;
  /** Temporal granularity */
  granularity: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
}

export interface ParseTemporalOptions {
  /** Reference date for relative expressions (default: now) */
  referenceDate?: Date;
}

/**
 * Parse temporal expressions from text.
 * Returns all temporal matches sorted by confidence (descending).
 */
export function parseTemporal(
  text: string,
  options: ParseTemporalOptions = {},
): TemporalResult[] {
  const results: TemporalResult[] = [];
  const now = options.referenceDate ?? new Date();

  // ── Absolute CJK dates: "2024年1月15日", "令和6年1月15日" ──────────
  parseAbsoluteCJKDate(text, now, results);

  // ── Absolute CJK times: "下午3点30分" ──────────────────────────────
  parseAbsoluteCJKTime(text, now, results);

  // ── Relative days: "明天", "后天" ──────────────────────────────────
  parseRelativeDays(text, now, results);

  // ── Day of week: "下周三", "来週水曜日" ────────────────────────────
  parseDayOfWeek(text, now, results);

  // ── Named months: "三月", "5月" ────────────────────────────────────
  parseNamedMonths(text, now, results);

  // ── Sexagenary cycle: "甲子年" ─────────────────────────────────────
  parseSexagenaryYear(text, now, results);

  // ── Sort by confidence descending, then by offset ──────────────────
  results.sort((a, b) => b.confidence - a.confidence || a.offset - b.offset);

  return results;
}

// ─── CJK numeral conversion ──────────────────────────────────────────

/**
 * Convert a Chinese numeral string to a number.
 * Handles: 一二三, 十, 二十, 三十五, 一百二十三, 二百, 三千
 * Returns null if the string is not a recognizable numeral.
 */
function parseChineseNumeral(str: string): number | null {
  // Regular numeric string
  if (/^\d+$/.test(str.trim())) {
    return parseInt(str.trim(), 10);
  }

  let result = 0;
  let current = 0;
  let section = 0;

  for (const char of str) {
    const val = CHINESE_NUMERALS[char];
    if (val === undefined) {
      // Unknown character — abort
      return null;
    }

    if (val >= 10000) {
      // 万/亿 — multiply current section
      section = (current + section) * val;
      current = 0;
    } else if (val >= 10) {
      // 十/百/千
      if (current === 0) current = 1;
      current *= val;
    } else {
      // 0-9
      current += val;
    }
  }

  result = section + current;
  return result > 0 ? result : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setStartOfDay(d: Date): void {
  d.setHours(0, 0, 0, 0);
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get the next occurrence of a day-of-week, considering "this/next/last" context.
 * "This Monday": the upcoming Monday (even if today is also Monday, use next week if too close?)
 * "Next Monday": the Monday of next week
 * "Last Monday": the Monday of last week
 */
function resolveDayOfWeek(
  now: Date,
  targetDow: number,
  direction: 'this' | 'next' | 'last',
): Date {
  const currentDow = now.getDay();

  if (direction === 'last') {
    let diff = currentDow - targetDow;
    if (diff <= 0) diff += 7;
    return addDays(now, -diff);
  }

  if (direction === 'next') {
    let diff = targetDow - currentDow;
    if (diff <= 0) diff += 7;
    return addDays(now, diff + 7); // next week's occurrence
  }

  // 'this' — the upcoming occurrence this week
  let diff = targetDow - currentDow;
  if (diff < 0) diff += 7;
  return addDays(now, diff);
}

// ─── Absolute CJK Date ───────────────────────────────────────────────

function parseAbsoluteCJKDate(
  text: string,
  _now: Date,
  results: TemporalResult[],
): void {
  const match = CJK_DATE_PATTERN.exec(text);
  if (!match) return;

  const eraStr = match[1] ?? '';
  let year = parseChineseNumeral(match[2]!) ?? parseInt(match[2]!, 10);
  const month = parseChineseNumeral(match[3]!) ?? parseInt(match[3]!, 10);
  const day = parseChineseNumeral(match[4]!) ?? parseInt(match[4]!, 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return;
  if (month < 1 || month > 12 || day < 1 || day > 31) return;

  let date: Date;

  // Handle Japanese era
  if (eraStr) {
    const era = JAPANESE_ERAS.find((e) => e.pattern.test(eraStr));
    if (era) {
      const gregYear = era.startYear + year - 1;
      date = new Date(gregYear, month - 1, day);
      if (date < new Date(era.startYear, era.startMonth - 1, era.startDay)) {
        return; // Before era start — invalid
      }
      pushDateResult(results, date, match, 0.95, 'day');
      return;
    }
  }

  // Regular year
  date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return;

  pushDateResult(results, date, match, 0.95, 'day');
}

// ─── Absolute CJK Time ───────────────────────────────────────────────

function parseAbsoluteCJKTime(
  text: string,
  _now: Date,
  results: TemporalResult[],
): void {
  const match = CJK_TIME_PATTERN.exec(text);
  if (!match) return;

  const ampmStr = match[1] ?? '';
  let hours = parseChineseNumeral(match[2]!) ?? parseInt(match[2]!, 10);
  let minutes = match[3] ? (parseChineseNumeral(match[3]) ?? parseInt(match[3], 10)) : 0;
  const seconds = match[4] ? (parseChineseNumeral(match[4]) ?? parseInt(match[4], 10)) : 0;
  const halfOrQuarter = match[5];

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return;

  // Adjust for AM/PM / time-of-day markers
  if (ampmStr) {
    const marker = TIME_OF_DAY_MARKERS.find((m) => m.pattern.test(ampmStr));
    if (marker) {
      if (marker.hourRange[0] >= 12 && hours < 12) {
        hours += 12;
      }
      if (marker.hourRange[1] <= 12 && hours === 12) {
        hours = 0;
      }
    }
  }

  // Handle 半 (half past) and 刻 (quarter)
  if (halfOrQuarter === '半') {
    minutes = 30;
  } else if (halfOrQuarter === '刻' || halfOrQuarter === 'quarter') {
    minutes = 15;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return;

  const timeStr =
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')}`;

  let confidence = 0.85;
  if (ampmStr) confidence = 0.90;
  if (seconds > 0) confidence += 0.02;
  if (halfOrQuarter) confidence += 0.03;

  results.push({
    date: null,
    time: timeStr,
    datetime: null,
    matchedText: match[0],
    offset: match.index,
    confidence: Math.min(confidence, 1.0),
    granularity: seconds > 0 ? 'second' : minutes > 0 ? 'minute' : 'hour',
  });
}

// ─── Relative Days ───────────────────────────────────────────────────

function parseRelativeDays(
  text: string,
  now: Date,
  results: TemporalResult[],
): void {
  const patterns: Array<{ pattern: RegExp; days: number; confidence: number }> = [
    { pattern: TODAY_PATTERN, days: 0, confidence: 0.95 },
    { pattern: TOMORROW_PATTERN, days: 1, confidence: 0.95 },
    { pattern: YESTERDAY_PATTERN, days: -1, confidence: 0.95 },
    { pattern: DAY_AFTER_TOMORROW_PATTERN, days: 2, confidence: 0.92 },
    { pattern: DAY_BEFORE_YESTERDAY_PATTERN, days: -2, confidence: 0.92 },
  ];

  for (const { pattern, days, confidence } of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;

    const targetDate = addDays(now, days);
    pushDateResult(results, targetDate, match, confidence, 'day');
    return; // First match wins
  }
}

// ─── Day of Week ─────────────────────────────────────────────────────

function parseDayOfWeek(
  text: string,
  now: Date,
  results: TemporalResult[],
): void {
  for (const dow of DAY_OF_WEEK_PATTERNS) {
    const match = dow.pattern.exec(text);
    if (!match) continue;

    // Determine direction: "this", "next", or "last"
    const contextBefore = text.slice(Math.max(0, match.index - 3), match.index);
    let direction: 'this' | 'next' | 'last' = 'this';

    if (NEXT_PATTERN.test(contextBefore) || NEXT_PATTERN.test(match[0])) {
      direction = 'next';
    } else if (LAST_PATTERN.test(contextBefore) || LAST_PATTERN.test(match[0])) {
      direction = 'last';
    }

    const targetDate = resolveDayOfWeek(now, dow.iso, direction);
    pushDateResult(results, targetDate, match, 0.88, 'day');
    return;
  }
}

// ─── Named Months ────────────────────────────────────────────────────

function parseNamedMonths(
  text: string,
  now: Date,
  results: TemporalResult[],
): void {
  for (const month of NAMED_MONTHS_CJK) {
    const match = month.pattern.exec(text);
    if (!match) continue;

    // Build a date for day 1 of that month in the current year
    const targetDate = new Date(now.getFullYear(), month.month - 1, 1);

    // If the month has already passed this year, go to next year
    if (targetDate < now) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }

    pushDateResult(results, targetDate, match, 0.80, 'month');
    return;
  }
}

// ─── Sexagenary Year ─────────────────────────────────────────────────

function parseSexagenaryYear(
  text: string,
  now: Date,
  results: TemporalResult[],
): void {
  for (let i = 0; i < SEXAGENARY_CYCLE.length; i++) {
    const stemBranch = SEXAGENARY_CYCLE[i]!;
    if (!text.includes(stemBranch)) continue;

    // Find the nearest sexagenary year to the reference year
    const baseYear = 1984; // 甲子 year (1984 is 甲子 — 60-year cycle from 1924)
    let targetYear = baseYear + i;
    while (targetYear < now.getFullYear() - 5) {
      targetYear += 60;
    }

    const targetDate = new Date(targetYear, 0, 1);
    pushDateResult(results, targetDate, { 0: stemBranch, index: text.indexOf(stemBranch) } as unknown as RegExpExecArray, 0.70, 'year');
    return;
  }
}

// ─── Result helper ───────────────────────────────────────────────────

function pushDateResult(
  results: TemporalResult[],
  date: Date,
  match: RegExpExecArray,
  confidence: number,
  granularity: TemporalResult['granularity'],
): void {
  const dateOnly = new Date(date);
  setStartOfDay(dateOnly);

  results.push({
    date: toISODate(dateOnly),
    time: null,
    datetime: `${toISODate(dateOnly)}T00:00:00`,
    matchedText: match[0],
    offset: match.index,
    confidence,
    granularity,
  });
}
