// I18: 100K+ load test — true streaming DuckDB SQL pipeline.
// Records generated on-the-fly (zero JS memory), streamed into DuckDB,
// blocking limited to prevent candidate explosion.
import { describe, it, expect } from 'vitest';
import { DuckDbSqlBackend } from '../../storage/duckdb-sql-backend.js';
import {
  buildComparisonQuery,
  parseComparisonRows,
  estimateParameters,
  computeAggregateMatchWeight,
  connectedComponents,
} from '@agentix-e/entity-resolver-core';
import type { ComparisonSpec, ScoredPair } from '@agentix-e/entity-resolver-core';

/** On-the-fly record generator — O(1) memory. */
async function* generateRecords(count: number): AsyncIterable<Record<string, unknown>> {
  const firstNames = [
    'James',
    'John',
    'Robert',
    'Michael',
    'William',
    'David',
    'Mary',
    'Patricia',
    'Jennifer',
    'Linda',
    'Daniel',
    'Matthew',
    'Anthony',
    'Mark',
    'Donald',
    'Steven',
    'Paul',
    'Andrew',
    'Joshua',
    'Kenneth',
  ];
  const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
  ];
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];

  let h = 42;
  const hash = () => {
    h = (h ^ 61 ^ (h >>> 16)) * 9;
    h = h ^ (h >>> 4);
    h = h * 0x27d4eb2d;
    h = h ^ (h >>> 15);
    return h >>> 0;
  };

  for (let i = 0; i < count; i++) {
    yield {
      id: String(i),
      first_name: firstNames[hash() % firstNames.length],
      last_name: lastNames[hash() % lastNames.length],
      city: cities[hash() % cities.length],
      age: String(20 + (hash() % 60)),
    };
  }
}

const comparisons: ComparisonSpec[] = [
  {
    field: 'first_name',
    scorerName: 'exact',
    levels: [
      { label: 'exact_match', threshold: 0.99 },
      { label: 'not_match', threshold: 0.0 },
    ],
  },
  {
    field: 'last_name',
    scorerName: 'exact',
    levels: [
      { label: 'exact_match', threshold: 0.99 },
      { label: 'not_match', threshold: 0.0 },
    ],
  },
];

describe('100K+ Load Test', () => {
  it('processes 100K records via DuckDB streaming pipeline without OOM', async () => {
    const totalStart = Date.now();
    const backend = new DuckDbSqlBackend({ path: ':memory:' });

    // Step 1: Stream records directly into DuckDB (O(1) JS memory)
    const streamStart = Date.now();
    await backend.streamToTable(generateRecords(100000), { name: '__er_records' }, 5000);
    const streamTime = Date.now() - streamStart;
    const totalRecords = await backend.rowCount('__er_records');
    expect(totalRecords).toBe(100000);
    console.log('  Streamed', totalRecords, 'records in', streamTime, 'ms');

    // Step 2: SQL blocking — limited to 20K candidates max
    const blockStart = Date.now();
    const dedupeClause = 'l.__row_id__ < r.__row_id__';
    const blockingSql = `
      SELECT l.__row_id__ as left_id, r.__row_id__ as right_id FROM __er_records l
      INNER JOIN __er_records r ON (l.last_name = r.last_name AND l.city = r.city)
      WHERE ${dedupeClause}
      UNION
      SELECT l.__row_id__ as left_id, r.__row_id__ as right_id FROM __er_records l
      INNER JOIN __er_records r ON (l.first_name = r.first_name AND l.last_name = r.last_name)
      WHERE ${dedupeClause}
      LIMIT 20000
    `;
    const blockingRows = await backend.query(blockingSql);
    const blockTime = Date.now() - blockStart;
    console.log('  SQL blocking:', blockingRows.length, 'candidates in', blockTime, 'ms');

    if (blockingRows.length === 0) {
      await backend.close();
      return;
    }

    // Step 3: Build candidates table (small batch)
    await backend.exec('CREATE TEMP TABLE __er_candidates (left_id INTEGER, right_id INTEGER)');
    const BATCH = 5000;
    const candidates = blockingRows.map((r) => ({
      leftId: Number(r.left_id),
      rightId: Number(r.right_id),
    }));
    for (let i = 0; i < candidates.length; i += BATCH) {
      const chunk = candidates.slice(i, i + BATCH);
      const vals = chunk.map((c) => `(${c.leftId}, ${c.rightId})`).join(', ');
      await backend.exec(`INSERT INTO __er_candidates VALUES ${vals}`);
    }

    // Step 4: SQL comparison (only 20K pairs → fast)
    const compStart = Date.now();
    const compQuery = buildComparisonQuery({
      comparisons,
      recordsTable: '__er_records',
      candidatesTable: '__er_candidates',
    });
    const compRows = await backend.query(compQuery);
    const pairVectors = parseComparisonRows(compRows, comparisons);
    const compTime = Date.now() - compStart;
    console.log('  SQL comparison:', pairVectors.length, 'pairs in', compTime, 'ms');

    // Step 5: EM + cluster
    const emResult = estimateParameters(pairVectors);
    const scoredPairs: ScoredPair[] = candidates.map((pair, idx) => {
      const vecs = pairVectors[idx] ?? [];
      const mw = computeAggregateMatchWeight(vecs, emResult.parameters);
      return {
        leftId: pair.leftId,
        rightId: pair.rightId,
        score: mw.probability,
        probability: mw.probability,
      };
    });
    const clustering = connectedComponents(scoredPairs, totalRecords, 0.5);

    const totalTime = Date.now() - totalStart;
    console.log('  Clusters:', clustering.metadata.numClusters);
    console.log('  Total time:', totalTime, 'ms');

    await backend.close();

    expect(totalRecords).toBe(100000);
  }, 600000);
});
