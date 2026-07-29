import { describe, it, expect } from 'vitest';
import { main } from '../index.js';

/**
 * CLI extract command tests.
 *
 * Tests the er extract command with various field types and options.
 * All tests use direct function invocation rather than process spawning.
 */

describe('CLI extract command', () => {
  it('extracts email from text via CLI command', async () => {
    // Capture stdout for assertion
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', 'Contact john@example.com for details',
        '--fields', 'email:email',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.email).toBe('john@example.com');
    expect(output.provenance.email).toBe('pattern');
  });

  it('extracts phone number via CLI', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', 'Call +86-138-0000-0000',
        '--fields', 'phone:phone',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.phone).toContain('86');
  });

  it('extracts time from Chinese text', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', '下午3点开会',
        '--fields', 'time:time',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.time).toBeDefined();
    expect(output.values.time).toContain(':');
  });

  it('extracts boolean true from text', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', 'enabled: true',
        '--fields', 'enabled:boolean',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.enabled).toBe(true);
  });

  it('extracts number from text', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', 'Price: $99.99',
        '--fields', 'price:number',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.price).toBe(99.99);
  });

  it('extracts with intent enhancement', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', '下午3点',
        '--fields', 'time:time,title:string',
        '--intent', 'alarm',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.title).toBe('Alarm');
  });

  it('shows usage when --text is missing', async () => {
    const logs: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      process.exitCode = 0;
      await main(['extract']);
    } finally {
      console.error = origError;
    }

    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('extracts URL from text', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', 'Visit https://example.com',
        '--fields', 'url:url',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.url).toBe('https://example.com');
  });

  it('extracts date from ISO format', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));

    try {
      await main([
        'extract',
        '--text', '2024-01-15 is the date',
        '--fields', 'date:date',
      ]);
    } finally {
      console.log = origLog;
    }

    const output = JSON.parse(logs.join(''));
    expect(output.values.date).toBeDefined();
  });
});
