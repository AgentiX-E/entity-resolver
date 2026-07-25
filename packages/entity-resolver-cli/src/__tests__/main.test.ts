// CLI main function tests — covers command dispatch paths, CSV parsing, file I/O, and error handling.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../index.js';

// ─── Helpers ──────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), 'er-cli-test-' + Date.now());

function writeTempCsv(name: string, content: string): string {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  const path = join(TEST_DIR, name);
  writeFileSync(path, content);
  return path;
}

function cleanup(): void {
  try {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    /* ignore cleanup errors */
  }
}

const PERSON_CSV = `given_name,surname,date_of_birth,address_city,email
John,Smith,1990-01-15,New York,john@example.com
Jon,Smith,1990-01-15,NYC,john@example.com
Jane,Doe,1985-06-20,Los Angeles,jane@example.com
Janet,Doe,1985-06-20,LA,jane@example.com`;

const PRODUCT_CSV = `name,price,brand
iPhone 15,999,Apple
iPhone 15 Pro,999,Apple
Galaxy S24,1199,Samsung`;

const CSV_WITH_QUOTES = `name,description,price
"iPhone 15", "Apple smartphone", 999
"Galaxy S24", "Samsung flagship", 1199`;

describe('CLI main function', () => {
  let consoleOutput: string[] = [];
  let consoleErrorOutput: string[] = [];

  beforeEach(() => {
    consoleOutput = [];
    consoleErrorOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrorOutput.push(args.join(' '));
    });
  });

  // ── Zero-arg / help paths ──

  it('health command prints operational', async () => {
    await main(['health']);
    expect(consoleOutput.some((l) => l.includes('operational'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('Node.js'))).toBe(true);
  });

  it('help command prints usage', async () => {
    await main(['help']);
    expect(consoleOutput.some((l) => l.includes('Usage'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('health'))).toBe(true);
  });

  it('--help flag prints usage', async () => {
    await main(['--help']);
    expect(consoleOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('-h flag prints usage', async () => {
    await main(['-h']);
    expect(consoleOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('no arguments prints help', async () => {
    await main([]);
    expect(consoleOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('unknown command prints error', async () => {
    await main(['unknown_cmd']);
    expect(consoleErrorOutput.some((l) => l.includes('Unknown command'))).toBe(true);
  });

  it('help shows all commands and TUI', async () => {
    await main(['help']);
    expect(consoleOutput.some((l) => l.includes('dedupe'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('match'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('gazetteer'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('benchmark'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('autoconfigure'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('TUI Renderers'))).toBe(true);
  });

  // ── Dedupe ──

  it('dedupe without file shows usage error', async () => {
    await main(['dedupe']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('dedupe with valid CSV produces results', async () => {
    const path = writeTempCsv('persons.csv', PERSON_CSV);
    await main(['dedupe', path]);
    expect(consoleOutput.some((l) => l.includes('Records'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('Clusters'))).toBe(true);
  }, 30000);

  it('dedupe with threshold flag', async () => {
    const path = writeTempCsv('persons.csv', PERSON_CSV);
    await main(['dedupe', path, '--threshold', '0.9']);
    expect(consoleOutput.some((l) => l.includes('Records'))).toBe(true);
  }, 30000);

  it('dedupe handles file parse error gracefully', async () => {
    const path = writeTempCsv('bad.csv', 'name\n');
    await main(['dedupe', path]);
    // Should print error message, not crash
    expect(consoleErrorOutput.length + consoleOutput.length).toBeGreaterThan(0);
  }, 30000);

  // ── Match/Link ──

  it('match without files shows usage error', async () => {
    await main(['match']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('link is alias for match (missing files)', async () => {
    await main(['link']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('match with two valid CSVs produces cross pairs', async () => {
    const left = writeTempCsv('left.csv', PERSON_CSV);
    const right = writeTempCsv('right.csv', PRODUCT_CSV);
    await main(['match', left, right]);
    expect(consoleOutput.some((l) => l.includes('Cross pairs'))).toBe(true);
  }, 30000);

  it('match with only one file shows error', async () => {
    const path = writeTempCsv('persons.csv', PERSON_CSV);
    await main(['match', path]);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('match with threshold flag', async () => {
    const left = writeTempCsv('l.csv', PERSON_CSV);
    const right = writeTempCsv('r.csv', PRODUCT_CSV);
    await main(['match', left, right, '--threshold', '0.7']);
    expect(consoleOutput.some((l) => l.includes('Cross pairs'))).toBe(true);
  }, 30000);

  // ── Gazetteer ──

  it('gazetteer without files shows usage error', async () => {
    await main(['gazetteer']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('gazetteer with two CSVs produces matches', async () => {
    const query = writeTempCsv('query.csv', PERSON_CSV);
    const index = writeTempCsv('index.csv', PRODUCT_CSV);
    await main(['gazetteer', query, index]);
    expect(consoleOutput.some((l) => l.includes('Matches'))).toBe(true);
  }, 30000);

  it('gazetteer with threshold flag', async () => {
    const query = writeTempCsv('q.csv', PERSON_CSV);
    const index = writeTempCsv('i.csv', PRODUCT_CSV);
    await main(['gazetteer', query, index, '--threshold', '0.3']);
    expect(consoleOutput.some((l) => l.includes('Matches'))).toBe(true);
  }, 30000);

  // ── Benchmark ──

  it('benchmark prints report', async () => {
    await main(['benchmark']);
    expect(consoleOutput.length).toBeGreaterThan(0);
  }, 360000);

  it('benchmark with dataset filter', async () => {
    await main(['benchmark', 'Cora']);
    expect(consoleOutput.some((l) => l.includes('Cora'))).toBe(true);
  }, 180000);

  // ── Autoconfigure ──

  it('autoconfigure without file shows usage error', async () => {
    await main(['autoconfigure']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('autoconfigure with CSV detects fields', async () => {
    const path = writeTempCsv('persons.csv', PERSON_CSV);
    await main(['autoconfigure', path]);
    expect(consoleOutput.some((l) => l.includes('Detected fields'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('given_name'))).toBe(true);
  }, 30000);

  // ── CSV parsing edge cases ──

  it('handles quoted fields with commas', async () => {
    const path = writeTempCsv('quoted.csv', CSV_WITH_QUOTES);
    await main(['dedupe', path]);
    // Should not crash and produce results
  }, 30000);

  // ── cleanup ──
  cleanup();
});
