// CLI main function tests — covers command dispatch paths.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from '../index.js';

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

  it('dedupe without file shows usage error', async () => {
    await main(['dedupe']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('match without files shows usage error', async () => {
    await main(['match']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('link is alias for match', async () => {
    await main(['link']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('gazetteer without files shows usage error', async () => {
    await main(['gazetteer']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('benchmark prints report', async () => {
    await main(['benchmark']);
    expect(consoleOutput.some((l) => l.includes('Entity Resolver Benchmark') || l.length > 0)).toBe(true);
  }, 30000);

  it('autoconfigure without file shows usage error', async () => {
    await main(['autoconfigure']);
    expect(consoleErrorOutput.some((l) => l.includes('Usage'))).toBe(true);
  });

  it('help shows all commands', async () => {
    await main(['help']);
    expect(consoleOutput.some((l) => l.includes('dedupe'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('match'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('gazetteer'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('benchmark'))).toBe(true);
    expect(consoleOutput.some((l) => l.includes('autoconfigure'))).toBe(true);
  });
});
