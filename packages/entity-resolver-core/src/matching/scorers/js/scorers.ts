// Pure JS scorer implementations — 19 scorers for entity-resolver.
// These implement the IScorer interface and are always available.
// The WASM module (scorers/wasm/) provides accelerated alternatives.

import type { IScorer } from '../../../interfaces/IScorer.js';
import type { FieldMetadata } from '../../../types/core.js';
import {
  levenshteinSimilarity,
  damerauLevenshtein,
  jaro,
  jaroWinkler,
  dice,
  jaccard,
  overlap,
  lcsSimilarity,
  soundex,
  doubleMetaphone,
} from 'strsimkit';

// ─── Utility helpers ───────────────────────────────────────────

/** Ensure input is a string, returning empty string for non-strings. */
function toString(val: unknown): string {
  if (val == null) return '';
  return String(val);
}

/** Clamp a numeric value to [0, 1]. */
function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Normalize Damerau-Levenshtein distance to [0, 1] similarity. */
function damerauLevenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = damerauLevenshtein(a, b);
  return clamp01(1 - dist / Math.max(a.length, b.length));
}

/** Tokenize a string into words. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s,._\-:;]+/)
    .filter(Boolean);
}

// ─── Scorer implementations ────────────────────────────────────

/**
 * Exact match: 1.0 if equal after trimming, 0.0 otherwise.
 * Best for: identifiers, emails, phone numbers (after normalization).
 */
export const exactScorer: IScorer = {
  name: 'exact',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim();
    const sb = toString(b).trim();
    return sa === sb && sa !== '' ? 1 : 0;
  },
};

/**
 * Normalized Levenshtein similarity [0, 1].
 * Best for: general text with typos.
 */
export const levenshteinScorer: IScorer = {
  name: 'levenshtein',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim();
    const sb = toString(b).trim();
    return levenshteinSimilarity(sa, sb);
  },
};

/**
 * Normalized Damerau-Levenshtein similarity (includes transpositions).
 * Best for: text with character-swap errors (e.g., "CAKE" vs "ACKE").
 */
export const damerauLevenshteinScorer: IScorer = {
  name: 'damerau_levenshtein',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    return damerauLevenshteinSimilarity(toString(a).trim(), toString(b).trim());
  },
};

/**
 * Jaro similarity [0, 1].
 * Best for: short strings like ID numbers where character order matters less.
 */
export const jaroScorer: IScorer = {
  name: 'jaro',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    return jaro(toString(a).trim(), toString(b).trim());
  },
};

/**
 * Jaro-Winkler similarity — Jaro with prefix bonus.
 * Best for: personal names (MARTHA vs MARHTA = 0.961).
 */
export const jaroWinklerScorer: IScorer = {
  name: 'jaro_winkler',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    return jaroWinkler(toString(a).trim(), toString(b).trim());
  },
};

/**
 * Dice coefficient — bigram overlap [0, 1].
 * Best for: multi-word text, company names.
 */
export const diceScorer: IScorer = {
  name: 'dice',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    return dice(toString(a).trim(), toString(b).trim());
  },
};

/**
 * Jaccard similarity — n-gram set overlap [0, 1].
 * Best for: sets, addresses split into tokens.
 */
export const jaccardScorer: IScorer = {
  name: 'jaccard',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    return jaccard(toString(a).trim(), toString(b).trim());
  },
};

/**
 * Overlap coefficient [0, 1].
 * Best for: cases where subset/superset relationship matters.
 */
export const overlapScorer: IScorer = {
  name: 'overlap',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    return overlap(toString(a).trim(), toString(b).trim());
  },
};

/**
 * Longest Common Subsequence similarity [0, 1].
 * Best for: preserving order in long text comparisons.
 */
export const lcsScorer: IScorer = {
  name: 'lcs',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    return lcsSimilarity(toString(a).trim(), toString(b).trim());
  },
};

/**
 * Soundex phonetic match: 1.0 if same Soundex code, 0.0 otherwise.
 * Best for: English surnames — Robert vs Rupert share R163.
 */
export const soundexScorer: IScorer = {
  name: 'soundex',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim();
    const sb = toString(b).trim();
    if (sa === '' || sb === '') return 0;
    try {
      return soundex(sa) === soundex(sb) ? 1 : 0;
    } catch {
      return 0;
    }
  },
};

/**
 * Double Metaphone fuzzy phonetic match.
 * Best for: non-English names, complex phonetic variations.
 */
export const doubleMetaphoneScorer: IScorer = {
  name: 'double_metaphone',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim();
    const sb = toString(b).trim();
    if (sa === '' || sb === '') return 0;
    try {
      const [pa, sa2] = doubleMetaphone(sa);
      const [pb, sb2] = doubleMetaphone(sb);
      if (pa === pb) return 1;
      if (pa === sb2 || sa2 === pb || sa2 === sb2) return 0.8;
      return 0;
    } catch {
      return 0;
    }
  },
};

/**
 * Token Sort Ratio: tokenize both strings, sort alphabetically, then
 * compute Jaro-Winkler on the joined sorted tokens.
 * Best for: word-order-independent comparisons (names, addresses).
 */
export const tokenSortScorer: IScorer = {
  name: 'token_sort',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim();
    const sb = toString(b).trim();
    if (sa === sb) return 1;
    const tokensA = tokenize(sa).sort();
    const tokensB = tokenize(sb).sort();
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    return jaroWinkler(tokensA.join(' '), tokensB.join(' '));
  },
};

/**
 * TF-IDF Cosine similarity using character bigrams as tokens.
 * Best for: product names, short text where bigram patterns matter.
 */
export const tfidfCosineScorer: IScorer = {
  name: 'tfidf_cosine',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim().toLowerCase();
    const sb = toString(b).trim().toLowerCase();
    if (sa === sb) return 1;
    if (sa.length < 2 || sb.length < 2) return 0;

    // Build bigram frequency maps
    const bigramsA = new Map<string, number>();
    const bigramsB = new Map<string, number>();
    for (let i = 0; i < sa.length - 1; i++) {
      const bg = sa.slice(i, i + 2);
      bigramsA.set(bg, (bigramsA.get(bg) ?? 0) + 1);
    }
    for (let i = 0; i < sb.length - 1; i++) {
      const bg = sb.slice(i, i + 2);
      bigramsB.set(bg, (bigramsB.get(bg) ?? 0) + 1);
    }

    // Cosine similarity on bigram frequency vectors
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (const [bg, freqA] of bigramsA) {
      const freqB = bigramsB.get(bg) ?? 0;
      dotProduct += freqA * freqB;
      magA += freqA * freqA;
    }
    for (const freqB of bigramsB.values()) {
      magB += freqB * freqB;
    }

    if (magA === 0 || magB === 0) return 0;
    return clamp01(dotProduct / (Math.sqrt(magA) * Math.sqrt(magB)));
  },
};

/**
 * Q-gram TF-IDF: tokenize into q-grams and compute Jaccard on the sets.
 * Best for: pyJedAI-compatible token-based comparisons.
 */
export const qgramTfIdfScorer: IScorer = {
  name: 'qgram_tfidf',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim().toLowerCase();
    const sb = toString(b).trim().toLowerCase();
    if (sa === sb) return 1;
    if (sa.length < 3 || sb.length < 3) return 0;

    const q = 3;
    const setA = new Set<string>();
    const setB = new Set<string>();
    for (let i = 0; i <= sa.length - q; i++) setA.add(sa.slice(i, i + q));
    for (let i = 0; i <= sb.length - q; i++) setB.add(sb.slice(i, i + q));

    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  },
};

/**
 * Ensemble scorer: weighted combination of jaro_winkler + levenshtein + token_sort + dice.
 * Best for: general-purpose name matching (GoldenMatch's recommended ensemble).
 */
export const ensembleScorer: IScorer = {
  name: 'ensemble',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim();
    const sb = toString(b).trim();
    if (sa === sb && sa !== '') return 1;
    if (sa === '' || sb === '') return 0;

    const jw = jaroWinkler(sa, sb);
    const lv = levenshteinSimilarity(sa, sb);
    const ts = tokenSortScorer.score(a, b, _field);
    const dc = dice(sa, sb);

    // Weights from GoldenMatch ensemble: jaro_winkler 0.4, levenshtein 0.2, token_sort 0.25, dice 0.15
    return clamp01(jw * 0.4 + lv * 0.2 + ts * 0.25 + dc * 0.15);
  },
};

/**
 * Numeric difference scorer: 1.0 if equal, linear decay otherwise.
 * Best for: numeric fields (age, quantity, price).
 */
export const numericDiffScorer: IScorer = {
  name: 'numeric_diff',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
    if (na === nb) return 1;
    const maxAbs = Math.max(Math.abs(na), Math.abs(nb), 1);
    const diff = Math.abs(na - nb);
    return clamp01(1 - diff / maxAbs);
  },
};

/**
 * Date difference scorer: similarity based on days between two dates.
 * Best for: date of birth, event dates.
 */
export const dateDiffScorer: IScorer = {
  name: 'date_diff',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const sa = toString(a).trim();
    const sb = toString(b).trim();
    if (sa === sb && sa !== '') return 1;

    const da = Date.parse(sa);
    const db = Date.parse(sb);
    if (Number.isNaN(da) || Number.isNaN(db)) return 0;

    const diffMs = Math.abs(da - db);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // Full score for same day, decay to 0 at 365 days
    return clamp01(1 - diffDays / 365);
  },
};

/**
 * Boolean match: 1.0 if both truthy or both falsy.
 * Best for: binary flags, yes/no fields.
 */
export const booleanMatchScorer: IScorer = {
  name: 'boolean_match',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const ba = Boolean(a);
    const bb = Boolean(b);
    return ba === bb ? 1 : 0;
  },
};

/**
 * Radial (geospatial) scorer — Haversine distance.
 * Expects values in "lat,lng" or "lat, lng" format.
 * Returns similarity in [0, 1] where 1 = same point, 0 = very far.
 */
export const radialScorer: IScorer = {
  name: 'radial',
  kernelized: false,
  score(a: unknown, b: unknown, _field: FieldMetadata): number {
    const coordA = parseCoordinates(a);
    const coordB = parseCoordinates(b);
    if (!coordA || !coordB) return 0;

    const distanceKm = haversineDistance(coordA.lat, coordA.lng, coordB.lat, coordB.lng);
    // Convert distance to similarity: 0 km → 1.0, 1000+ km → ~0
    // Using exponential decay: similarity = exp(-distance / 50)
    return Math.max(0, Math.exp(-distanceKm / 50));
  },
};

// ─── Aggregated scorer map ─────────────────────────────────────

/** All 20 scorers in a name-indexed map. */
export const ALL_SCORERS: Readonly<Record<string, IScorer>> = Object.freeze({
  exact: exactScorer,
  levenshtein: levenshteinScorer,
  damerau_levenshtein: damerauLevenshteinScorer,
  jaro: jaroScorer,
  jaro_winkler: jaroWinklerScorer,
  dice: diceScorer,
  jaccard: jaccardScorer,
  overlap: overlapScorer,
  lcs: lcsScorer,
  soundex: soundexScorer,
  double_metaphone: doubleMetaphoneScorer,
  token_sort: tokenSortScorer,
  tfidf_cosine: tfidfCosineScorer,
  qgram_tfidf: qgramTfIdfScorer,
  ensemble: ensembleScorer,
  numeric_diff: numericDiffScorer,
  date_diff: dateDiffScorer,
  boolean_match: booleanMatchScorer,
  radial: radialScorer,
});

/** Number of fully implemented scorers — runtime-computed. */
export const IMPLEMENTED_SCORER_COUNT = Object.keys(ALL_SCORERS).length;

// ─── Geospatial helpers ──────────────────────────────────────────

interface Coordinates {
  lat: number;
  lng: number;
}

/** Parse "lat,lng" or "lat, lng" string into coordinates. */
function parseCoordinates(value: unknown): Coordinates | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s/g, '');
  const parts = cleaned.split(',');
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]!);
  const lng = parseFloat(parts[1]!);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Haversine formula — great-circle distance between two points on Earth.
 * Returns distance in kilometers.
 */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
