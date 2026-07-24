// Field independence analysis for Fellegi-Sunter model diagnostics.
// FS assumes fields are independent — this module detects violations.

/**
 * Correlation warning for a pair of fields.
 */
export interface CorrelationWarning {
  readonly fieldA: string;
  readonly fieldB: string;
  /** Cramér's V measure of association (0 = independent, 1 = perfect association). */
  readonly cramersV: number;
  /** Severity of the correlation violation. */
  readonly severity: 'low' | 'medium' | 'high';
}

/**
 * Complete field correlation report.
 */
export interface CorrelationReport {
  readonly warnings: readonly CorrelationWarning[];
  readonly hasSevereViolations: boolean;
}

/**
 * Analyze field correlations in a dataset.
 *
 * Detects pairs of fields that are too closely correlated for the
 * independence assumption of the Fellegi-Sunter model.
 *
 * Severity thresholds (based on Cramér's V):
 *   V >= 0.5  → high severity — FS model validity compromised
 *   V >= 0.3  → medium severity — use with caution
 *   V >= 0.1  → low severity — minor concern
 *   V < 0.1   → no warning (fields are sufficiently independent)
 */
export function analyzeFieldCorrelations(
  records: ReadonlyArray<Record<string, unknown>>,
  fields: readonly string[],
): CorrelationReport {
  const warnings: CorrelationWarning[] = [];

  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      const fieldA = fields[i]!;
      const fieldB = fields[j]!;

      const v = computeCramersV(records, fieldA, fieldB);

      if (v >= 0.1) {
        warnings.push({
          fieldA,
          fieldB,
          cramersV: v,
          severity: v >= 0.5 ? 'high' : v >= 0.3 ? 'medium' : 'low',
        });
      }
    }
  }

  return {
    warnings,
    hasSevereViolations: warnings.some((w) => w.severity === 'high'),
  };
}

/**
 * Compute Cramér's V between two categorical fields.
 * V = sqrt(χ² / (n * min(k-1, r-1)))
 *
 * Returns a value in [0, 1] where 0 = independent, 1 = perfect association.
 */
function computeCramersV(
  records: ReadonlyArray<Record<string, unknown>>,
  fieldA: string,
  fieldB: string,
): number {
  // Build contingency table
  const rows = new Set<string>();
  const cols = new Set<string>();
  const table = new Map<string, Map<string, number>>();

  for (const record of records) {
    const a = String(record[fieldA] ?? '')
      .trim()
      .toLowerCase();
    const b = String(record[fieldB] ?? '')
      .trim()
      .toLowerCase();
    if (a === '' || b === '') continue;

    rows.add(a);
    cols.add(b);

    if (!table.has(a)) table.set(a, new Map());
    const rowMap = table.get(a)!;
    rowMap.set(b, (rowMap.get(b) ?? 0) + 1);
  }

  if (rows.size <= 1 || cols.size <= 1) return 0;

  // Compute expected frequencies and chi-squared
  let n = 0;
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();

  for (const [row, rowMap] of table) {
    let rowTotal = 0;
    for (const [col, count] of rowMap) {
      rowTotal += count;
      colTotals.set(col, (colTotals.get(col) ?? 0) + count);
    }
    rowTotals.set(row, rowTotal);
    n += rowTotal;
  }

  // Recompute colTotals properly
  colTotals.clear();
  for (const [, rowMap] of table) {
    for (const [col, count] of rowMap) {
      colTotals.set(col, (colTotals.get(col) ?? 0) + count);
    }
  }

  if (n === 0) return 0;

  let chiSquared = 0;
  for (const [row, rowMap] of table) {
    const rowTotal = rowTotals.get(row) ?? 0;
    if (rowTotal === 0) continue;
    for (const [col, observed] of rowMap) {
      const colTotal = colTotals.get(col) ?? 0;
      const expected = (rowTotal * colTotal) / n;
      if (expected > 0) {
        chiSquared += (observed - expected) ** 2 / expected;
      }
    }
  }

  const minDim = Math.min(rows.size, cols.size) - 1;
  if (minDim <= 0) return 0;

  const v = Math.sqrt(chiSquared / (n * minDim));
  return Math.min(1, v);
}
