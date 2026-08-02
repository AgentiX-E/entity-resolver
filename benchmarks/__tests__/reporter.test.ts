/**
 * Unit tests for the benchmark reporter module.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { generateHtmlReport, generateJsonReport } from '../lib/reporter.js';
import type { BenchmarkReport } from '../lib/types.js';

const OUT_DIR = '/tmp/benchmark-test-output';
mkdirSync(OUT_DIR, { recursive: true });

afterEach(() => {
  // Clean up test outputs
  for (const f of ['test-report.html', 'test-report.json']) {
    const p = `${OUT_DIR}/${f}`;
    if (existsSync(p)) unlinkSync(p);
  }
});

function buildSampleReport(): BenchmarkReport {
  return {
    timestamp: '2026-08-02T12:00:00Z',
    entityResolverVersion: '0.1.0-beta',
    competitorVersions: { splink: '4.0.16', goldenmatch: '3.10.0' },
    results: [
      {
        dataset: 'DBLP-ACM',
        mode: 'linkage',
        tool: 'entity-resolver',
        recordCount: 4910,
        trueMatchCount: 2224,
        metrics: {
          precision: 0.8854,
          recall: 0.8826,
          f1: 0.884,
          truePositives: 1963,
          falsePositives: 254,
          falseNegatives: 261,
          predictedPairs: 2217,
          truePairs: 2224,
          f1StdDev: 0.002,
          precisionStdDev: 0.001,
          recallStdDev: 0.003,
          runs: 3,
          f1Values: [0.883, 0.884, 0.885],
        },
        timing: {
          meanMs: 200,
          stdDevMs: 10,
          minMs: 190,
          maxMs: 210,
          runs: 3,
          perRunMs: [190, 200, 210],
        },
        candidatePairs: 2217,
        configFingerprint: 'er-DBLP-ACM-v1',
        toolVersion: '0.1.0-beta',
      },
      {
        dataset: 'DBLP-ACM',
        mode: 'linkage',
        tool: 'splink',
        recordCount: 4910,
        trueMatchCount: 2224,
        metrics: {
          precision: 0.646,
          recall: 0.834,
          f1: 0.728,
          truePositives: 1855,
          falsePositives: 1015,
          falseNegatives: 369,
          predictedPairs: 2870,
          truePairs: 2224,
          f1StdDev: 0,
          precisionStdDev: 0,
          recallStdDev: 0,
          runs: 1,
          f1Values: [0.728],
        },
        timing: {
          meanMs: 3400,
          stdDevMs: 0,
          minMs: 3400,
          maxMs: 3400,
          runs: 1,
          perRunMs: [3400],
        },
        candidatePairs: 2870,
        configFingerprint: 'splink-zero-config',
        toolVersion: '4.0.16',
      },
      {
        dataset: 'DBLP-ACM',
        mode: 'linkage',
        tool: 'goldenmatch',
        recordCount: 4910,
        trueMatchCount: 2224,
        metrics: {
          precision: 0.891,
          recall: 0.945,
          f1: 0.918,
          truePositives: 2101,
          falsePositives: 258,
          falseNegatives: 122,
          predictedPairs: 2359,
          truePairs: 2224,
          f1StdDev: 0,
          precisionStdDev: 0,
          recallStdDev: 0,
          runs: 1,
          f1Values: [0.918],
        },
        timing: {
          meanMs: 6200,
          stdDevMs: 0,
          minMs: 6200,
          maxMs: 6200,
          runs: 1,
          perRunMs: [6200],
        },
        candidatePairs: 2359,
        configFingerprint: 'goldenmatch-zero-config',
        toolVersion: '3.10.0',
      },
    ],
    comparisonMatrix: {
      datasets: ['DBLP-ACM'],
      tools: ['entity-resolver', 'splink', 'goldenmatch'],
      rows: {
        'DBLP-ACM': {
          'entity-resolver': { f1: 0.884, f1StdDev: 0.002, precision: 0.8854, recall: 0.8826, timeMeanMs: 200 },
          'splink': { f1: 0.728, f1StdDev: 0, precision: 0.646, recall: 0.834, timeMeanMs: 3400 },
          'goldenmatch': { f1: 0.918, f1StdDev: 0, precision: 0.891, recall: 0.945, timeMeanMs: 6200 },
        },
      },
    },
  };
}

describe('generateHtmlReport', () => {
  it('generates a valid HTML file', () => {
    const report = buildSampleReport();
    const outPath = `${OUT_DIR}/test-report.html`;
    generateHtmlReport(report, outPath);
    expect(existsSync(outPath)).toBe(true);

    const html = readFileSync(outPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('DBLP-ACM');
    expect(html).toContain('Entity Resolver');
    expect(html).toContain('Splink');
    expect(html).toContain('GoldenMatch');
    expect(html).toContain('0.8840');
    expect(html).toContain('0.7280');
    expect(html).toContain('0.9180');
  });

  it('includes F1 values with standard deviation', () => {
    const report = buildSampleReport();
    const outPath = `${OUT_DIR}/test-report.html`;
    generateHtmlReport(report, outPath);
    const html = readFileSync(outPath, 'utf-8');
    expect(html).toContain('±0.0020');
  });

  it('includes methodology section', () => {
    const report = buildSampleReport();
    const outPath = `${OUT_DIR}/test-report.html`;
    generateHtmlReport(report, outPath);
    const html = readFileSync(outPath, 'utf-8');
    expect(html).toContain('Methodology');
    expect(html).toContain('FEBRL-1000/5000 synthetic');
  });

  it('creates output directory if it does not exist', () => {
    const report = buildSampleReport();
    const nestedPath = `${OUT_DIR}/nested/deep/test-report.html`;
    generateHtmlReport(report, nestedPath);
    expect(existsSync(nestedPath)).toBe(true);
    unlinkSync(nestedPath);
  });

  it('handles report with no competitor results', () => {
    const noComp = { ...buildSampleReport(), results: [buildSampleReport().results[0]!] };
    const outPath = `${OUT_DIR}/test-report.html`;
    generateHtmlReport(noComp, outPath);
    const html = readFileSync(outPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    // Should still render without crashing
  });

  it('shows winner badge for best tool', () => {
    const report = buildSampleReport();
    const outPath = `${OUT_DIR}/test-report.html`;
    generateHtmlReport(report, outPath);
    const html = readFileSync(outPath, 'utf-8');
    expect(html).toContain('winner');
  });

  it('shows "Behind" badge when ER is significantly behind', () => {
    // Create a report where ER is far behind (> 0.05 F1 gap)
    const behindReport = buildSampleReport();
    const erResult = behindReport.results[0]!;
    erResult.metrics.f1 = 0.4;
    erResult.metrics.f1Values = [0.4];
    const outPath = `${OUT_DIR}/test-report.html`;
    generateHtmlReport(behindReport, outPath);
    const html = readFileSync(outPath, 'utf-8');
    expect(html).toContain('Behind');
  });
});

describe('generateJsonReport', () => {
  it('generates valid JSON output', () => {
    const report = buildSampleReport();
    const outPath = `${OUT_DIR}/test-report.json`;
    generateJsonReport(report, outPath);
    expect(existsSync(outPath)).toBe(true);

    const json = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(json.entityResolverVersion).toBe('0.1.0-beta');
    expect(json.results).toHaveLength(3);
    expect(json.comparisonMatrix.datasets).toContain('DBLP-ACM');
  });

  it('is idempotent — same report produces same JSON', () => {
    const report = buildSampleReport();
    const p1 = `${OUT_DIR}/test-report.json`;
    generateJsonReport(report, p1);
    const json1 = readFileSync(p1, 'utf-8');

    // Write again and compare
    generateJsonReport(report, p1);
    const json2 = readFileSync(p1, 'utf-8');
    expect(json1).toBe(json2);
  });
});
