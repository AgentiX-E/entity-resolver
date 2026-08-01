/**
 * Native JS scorers — zero dependency alternatives.
 *
 * Used when WASM module is not available (e.g., browser
 * environments without COOP/COEP headers, or Node without
 * WASM support). Provides competitive performance via
 * `fastest-levenshtein` npm package.
 */
import { distance as levenshteinDist } from 'fastest-levenshtein';

export function jsJaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const al = a.toLowerCase(),
    bl = b.toLowerCase();

  // Jaro similarity
  const matchDist = Math.floor(Math.max(al.length, bl.length) / 2) - 1;
  const am = new Array(al.length).fill(false);
  const bm = new Array(bl.length).fill(false);
  let m = 0;
  for (let i = 0; i < al.length; i++) {
    const lo = Math.max(0, i - matchDist),
      hi = Math.min(bl.length - 1, i + matchDist);
    for (let j = lo; j <= hi; j++) {
      if (!bm[j] && al[i] === bl[j]) {
        am[i] = true;
        bm[j] = true;
        m++;
        break;
      }
    }
  }
  if (m === 0) return 0;
  let t = 0,
    k = 0;
  for (let i = 0; i < al.length; i++) {
    if (am[i]) {
      while (!bm[k]) k++;
      if (al[i] !== bl[k]) t++;
      k++;
    }
  }
  const sim = (m / al.length + m / bl.length + (m - t / 2) / m) / 3;
  const prefix =
    al.length > 0 && bl.startsWith(al[0] ?? '')
      ? 0.1 * Math.min(4, (/^[a-z]+/i.exec(al))?.[0]?.length ?? 0)
      : 0;
  return sim + prefix;
}

export function jsLevenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDist(a, b) / maxLen;
}

export function jsDice(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const al = a.toLowerCase(),
    bl = b.toLowerCase();
  const bg = (s: string) => {
    const r: string[] = [];
    for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2));
    return r;
  };
  const ba = bg(al),
    bb = bg(bl);
  const inter = ba.filter((x) => bb.includes(x)).length;
  return (2 * inter) / (ba.length + bb.length);
}
