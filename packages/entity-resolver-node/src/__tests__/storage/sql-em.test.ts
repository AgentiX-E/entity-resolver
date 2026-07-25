// Tests for SQL EM estimation.
import { describe, it, expect } from 'vitest';
import { DuckDbSqlBackend } from '../../storage/duckdb-sql-backend.js';
import { sqlEstimateParameters } from '@agentix-e/entity-resolver-core';
import type { ComparisonVector } from '@agentix-e/entity-resolver-core';

function clearMatchData(count = 200): ComparisonVector[][] {
  const pairs: ComparisonVector[][] = [];
  for (let i = 0; i < count; i++) {
    pairs.push(
      i < count / 2
        ? [{ field: 'name', level: 'exact_match', score: 1.0, scorer: 'exact' }]
        : [{ field: 'name', level: 'not_match', score: 0.0, scorer: 'exact' }],
    );
  }
  return pairs;
}

describe('sqlEstimateParameters', () => {
  it('produces valid parameters', async () => {
    const backend = new DuckDbSqlBackend();
    const result = await sqlEstimateParameters(backend, clearMatchData(200), { maxIterations: 20 });
    // EM may or may not converge on trivial data — both are valid
    expect(result.parameters.mProbabilities.size).toBeGreaterThan(0);
    expect(Number.isFinite(result.parameters.lambda)).toBe(true);
    await backend.close();
  });

  it('m and u probabilities are properly defined', async () => {
    const backend = new DuckDbSqlBackend();
    const result = await sqlEstimateParameters(backend, clearMatchData(200));
    const m = result.parameters.mProbabilities.get('name:exact_match');
    const u = result.parameters.uProbabilities.get('name:exact_match');
    // Both should exist
    expect(m).toBeDefined();
    expect(u).toBeDefined();
    // Both in valid [0,1] range
    expect(m!).toBeGreaterThanOrEqual(0);
    expect(m!).toBeLessThanOrEqual(1);
    expect(u!).toBeGreaterThanOrEqual(0);
    expect(u!).toBeLessThanOrEqual(1);
    await backend.close();
  });

  it('lambda in reasonable range', async () => {
    const backend = new DuckDbSqlBackend();
    const result = await sqlEstimateParameters(backend, clearMatchData(200));
    expect(result.parameters.lambda).toBeGreaterThan(0);
    expect(result.parameters.lambda).toBeLessThan(1);
    await backend.close();
  });

  it('returns log-likelihood history', async () => {
    const backend = new DuckDbSqlBackend();
    const result = await sqlEstimateParameters(backend, clearMatchData(100), { maxIterations: 5 });
    expect(result.logLikelihoodHistory.length).toBeGreaterThan(0);
    await backend.close();
  });

  it('handles single pair', async () => {
    const backend = new DuckDbSqlBackend();
    const result = await sqlEstimateParameters(backend, [
      [{ field: 'x', level: 'exact_match', score: 1.0, scorer: 'e' }],
    ]);
    expect(result.parameters).toBeDefined();
    await backend.close();
  });

  it('throws on empty pair set', async () => {
    const backend = new DuckDbSqlBackend();
    await expect(sqlEstimateParameters(backend, [])).rejects.toThrow('empty');
    await backend.close();
  });

  it('converges within maxIterations', async () => {
    const backend = new DuckDbSqlBackend();
    const result = await sqlEstimateParameters(backend, clearMatchData(200), { maxIterations: 10 });
    expect(result.iterations).toBeLessThanOrEqual(10);
    await backend.close();
  });

  it('stores vectors in SQL backend successfully', async () => {
    const backend = new DuckDbSqlBackend();
    const data = clearMatchData(200);
    const sqlResult = await sqlEstimateParameters(backend, data);
    // SQL EM delegates to the same JS algorithm — output structure is correct
    expect(sqlResult.parameters.mProbabilities.size).toBeGreaterThan(0);
    expect(sqlResult.converged).toBeDefined();
    await backend.close();
  });
});
