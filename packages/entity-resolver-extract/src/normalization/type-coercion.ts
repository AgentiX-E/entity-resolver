/**
 * TypeCoercion — Converts extracted string values to their target types.
 *
 * After pattern matching, values are often in string form (the matched text).
 * TypeCoercion converts them to the target type specified by the schema:
 *   string → number (parseInt/parseFloat, strip formatting)
 *   string → boolean (match against truth tables)
 *   string → Date (parse ISO 8601 and common formats)
 *   string → string (passthrough with whitespace trim)
 *   string → enum (exact match against allowed values)
 *
 * Coercion failures are returned as null — the caller should fall back
 * to ONNX NER or LLM extraction for failed coercions.
 */

export type CoercionTarget =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'url';

export interface CoercionResult {
  /** The coerced value in its target type, or null if coercion failed */
  value: unknown;
  /** Whether the coercion was successful */
  success: boolean;
  /** The original raw value */
  rawValue: unknown;
  /** Target type attempted */
  targetType: CoercionTarget;
}

/**
 * Coerce a value to a target type.
 *
 * @param value - The raw extracted value (from PatternMatch.value)
 * @param targetType - The desired output type
 * @returns CoercionResult with success flag
 */
export function coerce(value: unknown, targetType: CoercionTarget): CoercionResult {
  const rawValue = value;

  if (value === null || value === undefined) {
    return { value: null, success: false, rawValue, targetType };
  }

  switch (targetType) {
    case 'string':
    case 'email':
    case 'phone':
    case 'url':
      return coerceString(value, targetType);

    case 'number':
      return coerceNumber(value);

    case 'integer':
      return coerceInteger(value);

    case 'boolean':
      return coerceBoolean(value);

    case 'date':
    case 'datetime':
      return coerceDate(value);

    case 'time':
      return coerceTime(value);

    default:
      // Unknown target type — pass through as string
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- type coercion: intentionally converts unknown to string
      return { value: String(value), success: true, rawValue, targetType };
  }
}

function coerceString(value: unknown, _type: CoercionTarget): CoercionResult {
  const str = String(value).trim();
  if (str.length === 0) {
    return { value: null, success: false, rawValue: value, targetType: _type };
  }
  return { value: str, success: true, rawValue: value, targetType: _type };
}

function coerceNumber(value: unknown): CoercionResult {
  if (typeof value === 'number' && !isNaN(value)) {
    return { value, success: true, rawValue: value, targetType: 'number' };
  }

  const str = String(value).trim();
  // Strip formatting: commas, spaces, currency symbols, percentage signs
  const cleaned = str
    .replace(/[,_\s]/g, '')
    .replace(/[%]/g, '')
    .replace(/\p{Sc}/gu, '');

  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    return { value: null, success: false, rawValue: value, targetType: 'number' };
  }

  // Handle percentage
  if (str.includes('%')) {
    return { value: num / 100, success: true, rawValue: value, targetType: 'number' };
  }

  return { value: num, success: true, rawValue: value, targetType: 'number' };
}

function coerceInteger(value: unknown): CoercionResult {
  if (typeof value === 'number' && !isNaN(value) && Number.isInteger(value)) {
    return { value, success: true, rawValue: value, targetType: 'integer' };
  }

  const result = coerceNumber(value);
  if (!result.success || result.value === null) {
    return { value: null, success: false, rawValue: value, targetType: 'integer' };
  }

  const num = result.value as number;
  if (!Number.isInteger(num)) {
    return { value: Math.round(num), success: true, rawValue: value, targetType: 'integer' };
  }

  return { value: num, success: true, rawValue: value, targetType: 'integer' };
}

function coerceBoolean(value: unknown): CoercionResult {
  if (typeof value === 'boolean') {
    return { value, success: true, rawValue: value, targetType: 'boolean' };
  }

  const str = String(value).trim().toLowerCase();

  // English
  if (['true', 'yes', 'y', 'on', '1'].includes(str)) {
    return { value: true, success: true, rawValue: value, targetType: 'boolean' };
  }
  if (['false', 'no', 'n', 'off', '0'].includes(str)) {
    return { value: false, success: true, rawValue: value, targetType: 'boolean' };
  }

  // Chinese
  if (['是', '对', '真', '有', '开', '✓', '✔', '✅'].includes(str)) {
    return { value: true, success: true, rawValue: value, targetType: 'boolean' };
  }
  if (['否', '不', '错', '假', '无', '没', '关', '✗', '✘', '❌'].includes(str)) {
    return { value: false, success: true, rawValue: value, targetType: 'boolean' };
  }

  return { value: null, success: false, rawValue: value, targetType: 'boolean' };
}

function coerceDate(value: unknown): CoercionResult {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return { value, success: true, rawValue: value, targetType: 'date' };
  }

  const str = String(value).trim();
  // Handle null/empty
  if (str.length === 0) {
    return { value: null, success: false, rawValue: value, targetType: 'date' };
  }

  const parsed = new Date(str);

  // Reject NaN dates
  if (isNaN(parsed.getTime())) {
    return { value: null, success: false, rawValue: value, targetType: 'date' };
  }

  return { value: parsed, success: true, rawValue: value, targetType: 'date' };
}

function coerceTime(value: unknown): CoercionResult {
  // Time values are already formatted as "HH:MM:SS" strings by the time matcher
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      const [h, m, s] = trimmed.split(':').map(Number);
      if (
        h !== undefined &&
        m !== undefined &&
        s !== undefined &&
        h >= 0 &&
        h <= 23 &&
        m >= 0 &&
        m <= 59 &&
        s >= 0 &&
        s <= 59
      ) {
        return { value: trimmed, success: true, rawValue: value, targetType: 'time' };
      }
      return { value: null, success: false, rawValue: value, targetType: 'time' };
    }
  }

  // Try to parse as HH:MM
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value.trim())) {
    const [h, m] = value.trim().split(':').map(Number);
    if (h !== undefined && m !== undefined && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      const normalized = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      return { value: normalized, success: true, rawValue: value, targetType: 'time' };
    }
  }

  return { value: null, success: false, rawValue: value, targetType: 'time' };
}

/**
 * Coerce multiple field values at once.
 * Returns a map of field → CoercionResult.
 */
export function coerceAll(
  fields: Record<string, unknown>,
  fieldTypes: Record<string, CoercionTarget>,
): Map<string, CoercionResult> {
  const results = new Map<string, CoercionResult>();
  for (const [field, value] of Object.entries(fields)) {
    const targetType = fieldTypes[field] ?? 'string';
    results.set(field, coerce(value, targetType));
  }
  return results;
}
