// Tests for SQL comparison — scorer-to-SQL expression mapping,
// comparison query generation, query parsing, and hybrid JS patching.
// Validates SQL output matches JS comparison for native scorers.
import { describe, it, expect } from 'vitest';
import {
  buildComparisonQuery,
  parseComparisonRows,
  requiresUdf,
  isSqlNative,
  SQL_UDF_SCORERS,
  patchUdfVectors,
} from '@agentix-e/entity-resolver-core';
import { DuckDbSqlBackend } from '../../storage/duckdb-sql-backend.js';
import type { ComparisonSpec, ComparisonVector } from '@agentix-e/entity-resolver-core';

// ═══════════════════════════════════════════════════════════════
// Scorer classification
// ═══════════════════════════════════════════════════════════════

describe('scorer classification', () => {
  it('native scorers do not require UDF', () => {
    expect(isSqlNative('exact')).toBe(true);
    expect(isSqlNative('numericDiff')).toBe(true);
    expect(isSqlNative('dateDiff')).toBe(true);
    expect(requiresUdf('exact')).toBe(false);
  });

  it('string scorers require UDF', () => {
    expect(requiresUdf('levenshtein')).toBe(true);
    expect(requiresUdf('jaro_winkler')).toBe(true);
    expect(isSqlNative('jaro_winkler')).toBe(false);
  });

  it('SQL_UDF_SCORERS contains exactly 5 entries', () => {
    expect(SQL_UDF_SCORERS.length).toBe(5);
    expect(SQL_UDF_SCORERS).toContain('levenshtein');
    expect(SQL_UDF_SCORERS).toContain('jaro');
    expect(SQL_UDF_SCORERS).toContain('jaro_winkler');
    expect(SQL_UDF_SCORERS).toContain('dice');
    expect(SQL_UDF_SCORERS).toContain('soundex');
  });
});

// ═══════════════════════════════════════════════════════════════
// buildComparisonQuery
// ═══════════════════════════════════════════════════════════════

describe('buildComparisonQuery', () => {
  it('generates valid SQL for exact match', () => {
    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'exact',
        levels: [{ label: 'exact_match', threshold: 0.99 }],
      },
    ];
    const sql = buildComparisonQuery({ comparisons: specs });
    expect(sql).toContain('SELECT');
    expect(sql).toContain('"name"');
    expect(sql).toContain('INNER JOIN');
    expect(sql).toContain('__er_records');
    expect(sql).toContain('__er_candidates');
  });

  it('generates SQL for multiple comparison specs', () => {
    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'exact',
        levels: [{ label: 'exact_match', threshold: 0.99 }],
      },
      {
        field: 'price',
        scorerName: 'numericDiff',
        levels: [{ label: 'close_match', threshold: 0.9 }],
      },
    ];
    const sql = buildComparisonQuery({ comparisons: specs });
    expect(sql).toContain('"name"');
    expect(sql).toContain('"price"');
    expect(sql).toContain('TRY_CAST');
  });

  it('generates SQL for dateDiff', () => {
    const specs: ComparisonSpec[] = [
      {
        field: 'dob',
        scorerName: 'dateDiff',
        levels: [{ label: 'within_30_days', threshold: 0.92 }],
      },
    ];
    const sql = buildComparisonQuery({ comparisons: specs });
    expect(sql).toContain('DATEDIFF');
  });

  it('handles empty comparisons', () => {
    const sql = buildComparisonQuery({ comparisons: [] });
    expect(sql).toContain('SELECT left_id, right_id');
  });

  it('uses custom table names', () => {
    const specs: ComparisonSpec[] = [
      { field: 'x', scorerName: 'exact', levels: [{ label: 'm', threshold: 0.5 }] },
    ];
    const sql = buildComparisonQuery({
      comparisons: specs,
      recordsTable: 'my_records',
      candidatesTable: 'my_pairs',
    });
    expect(sql).toContain('my_records');
    expect(sql).toContain('my_pairs');
  });

  it('UDF scorers produce -1.0 sentinel in SQL', () => {
    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'jaro_winkler',
        levels: [{ label: 'exact_match', threshold: 0.99 }],
      },
    ];
    const sql = buildComparisonQuery({ comparisons: specs });
    expect(sql).toContain('-1.0');
  });
});

// ═══════════════════════════════════════════════════════════════
// DuckDB SQL comparison — end-to-end
// ═══════════════════════════════════════════════════════════════

describe('DuckDB SQL comparison E2E', () => {
  const records = [
    { name: 'Alice Smith', city: 'NYC', price: '100', dob: '1990-01-15' },
    { name: 'Alice Smith', city: 'New York', price: '105', dob: '1990-01-15' },
    { name: 'Bob Jones', city: 'LA', price: '200', dob: '1985-06-20' },
  ];

  it('SQL exact match produces same results as JS scorer', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(records, { name: '__er_records' });

    // Insert candidate pairs manually
    await db.exec('CREATE TEMP TABLE __er_candidates (left_id INTEGER, right_id INTEGER)');
    await db.exec('INSERT INTO __er_candidates VALUES (0, 1), (0, 2), (1, 2)');

    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'exact',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'not_match', threshold: 0.0 },
        ],
      },
      {
        field: 'city',
        scorerName: 'exact',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'not_match', threshold: 0.0 },
        ],
      },
    ];

    const sql = buildComparisonQuery({ comparisons: specs });
    const rows = await db.query(sql);
    const vectors = parseComparisonRows(rows, specs);

    // Pair (0,1): name=exact→1.0, city=different→0.0
    expect(vectors[0]![0]!.score).toBe(1.0);
    expect(vectors[0]![1]!.score).toBe(0.0);

    // Pair (0,2): name=different→0.0
    expect(vectors[1]![0]!.score).toBe(0.0);

    await db.close();
  });

  it('SQL numericDiff produces correct distance', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(records, { name: '__er_records' });
    await db.exec('CREATE TEMP TABLE __er_candidates (left_id INTEGER, right_id INTEGER)');
    await db.exec('INSERT INTO __er_candidates VALUES (0, 1), (1, 2)');

    const specs: ComparisonSpec[] = [
      {
        field: 'price',
        scorerName: 'numericDiff',
        levels: [{ label: 'close_match', threshold: 0.9 }],
      },
    ];

    const sql = buildComparisonQuery({ comparisons: specs });
    const rows = await db.query(sql);
    const vectors = parseComparisonRows(rows, specs);

    // Price 100 vs 105: diff=5, max=105 → 1-5/105 = 0.952
    expect(vectors[0]![0]!.score).toBeGreaterThan(0.9);
    // Price 105 vs 200: diff=95, max=200 → 1-95/200 = 0.525
    expect(vectors[1]![0]!.score).toBeLessThan(0.6);

    await db.close();
  });

  it('SQL dateDiff produces correct similarity', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(records, { name: '__er_records' });
    await db.exec('CREATE TEMP TABLE __er_candidates (left_id INTEGER, right_id INTEGER)');
    await db.exec('INSERT INTO __er_candidates VALUES (0, 1), (0, 2)');

    const specs: ComparisonSpec[] = [
      {
        field: 'dob',
        scorerName: 'dateDiff',
        levels: [{ label: 'exact_match', threshold: 0.99 }],
      },
    ];

    const sql = buildComparisonQuery({ comparisons: specs });
    const rows = await db.query(sql);
    const vectors = parseComparisonRows(rows, specs);

    // Same date → score ≈ 1.0
    expect(vectors[0]![0]!.score).toBeGreaterThan(0.99);
    // Different dates (1990 vs 1985) → lower score
    expect(vectors[1]![0]!.score).toBeLessThan(0.99);

    await db.close();
  });

  it('parseComparisonRows assigns correct levels', async () => {
    const db = new DuckDbSqlBackend();
    await db.createTempTable(records, { name: '__er_records' });
    await db.exec('CREATE TEMP TABLE __er_candidates (left_id INTEGER, right_id INTEGER)');
    await db.exec('INSERT INTO __er_candidates VALUES (0, 1)');

    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'exact',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'strong_match', threshold: 0.85 },
          { label: 'not_match', threshold: 0.0 },
        ],
      },
    ];

    const sql = buildComparisonQuery({ comparisons: specs });
    const rows = await db.query(sql);
    const vectors = parseComparisonRows(rows, specs);

    // Alice Smith == Alice Smith → exact_match
    expect(vectors[0]![0]!.level).toBe('exact_match');
    expect(vectors[0]![0]!.scorer).toBe('exact');

    await db.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// Hybrid JS patching — UDF scorers
// ═══════════════════════════════════════════════════════════════

describe('patchUdfVectors', () => {
  it('patches jaro_winkler scores in SQL results', () => {
    const vectors: ComparisonVector[][] = [
      [{ field: 'name', level: 'not_match', score: -1.0, scorer: 'jaro_winkler' }],
    ];
    const candidates = [{ leftId: 0, rightId: 1 }];
    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'not_match', threshold: 0.0 },
        ],
      },
    ];
    const records = [{ name: 'John Smith' }, { name: 'John Smith' }];

    const scorers = new Map([
      [
        'jaro_winkler',
        (a: unknown, b: unknown) => {
          return String(a) === String(b) ? 1.0 : 0.0;
        },
      ],
    ]);

    patchUdfVectors(vectors, candidates, specs, records, scorers);

    // Should be patched with JS-computed score
    expect(vectors[0]![0]!.score).toBe(1.0);
    expect(vectors[0]![0]!.level).toBe('exact_match');
  });

  it('does not modify native scorer vectors', () => {
    const vectors: ComparisonVector[][] = [
      [{ field: 'name', level: 'exact_match', score: 1.0, scorer: 'exact' }],
    ];
    const candidates = [{ leftId: 0, rightId: 1 }];
    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'exact',
        levels: [{ label: 'exact_match', threshold: 0.99 }],
      },
    ];

    patchUdfVectors(vectors, candidates, specs, [{ name: 'A' }, { name: 'A' }], new Map());

    // Should remain unchanged
    expect(vectors[0]![0]!.score).toBe(1.0);
    expect(vectors[0]![0]!.scorer).toBe('exact');
  });

  it('handles multi-field mixed scorers', () => {
    const vectors: ComparisonVector[][] = [
      [
        { field: 'name', level: 'exact_match', score: 1.0, scorer: 'exact' },
        { field: 'city', level: 'not_match', score: -1.0, scorer: 'levenshtein' },
      ],
    ];
    const candidates = [{ leftId: 0, rightId: 1 }];
    const specs: ComparisonSpec[] = [
      {
        field: 'name',
        scorerName: 'exact',
        levels: [{ label: 'exact_match', threshold: 0.99 }],
      },
      {
        field: 'city',
        scorerName: 'levenshtein',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'weak_match', threshold: 0.5 },
          { label: 'not_match', threshold: 0.0 },
        ],
      },
    ];
    const records = [
      { name: 'A', city: 'NYC' },
      { name: 'A', city: 'NYC' },
    ];

    const scorers = new Map([['levenshtein', () => 1.0]]);

    patchUdfVectors(vectors, candidates, specs, records, scorers);

    expect(vectors[0]![0]!.score).toBe(1.0); // exact: unchanged
    expect(vectors[0]![1]!.score).toBe(1.0); // levenshtein: patched
    expect(vectors[0]![1]!.level).toBe('exact_match');
  });

  it('handles empty vectors gracefully', () => {
    const vectors: ComparisonVector[][] = [];
    patchUdfVectors(vectors, [], [], [], new Map());
    expect(vectors).toHaveLength(0);
  });
});
