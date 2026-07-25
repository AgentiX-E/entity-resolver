/**
 * Tests for the ILogger interface and NoopLogger implementation.
 */
import { describe, it, expect } from 'vitest';
import type { ILogger } from '../../interfaces/ILogger.js';
import { NoopLogger } from '../../interfaces/ILogger.js';

describe('ILogger interface', () => {
  it('NoopLogger satisfies ILogger contract', () => {
    const logger: ILogger = NoopLogger;
    expect(logger.debug).toBeInstanceOf(Function);
    expect(logger.info).toBeInstanceOf(Function);
    expect(logger.warn).toBeInstanceOf(Function);
    expect(logger.error).toBeInstanceOf(Function);
  });

  it('NoopLogger is frozen (immutable)', () => {
    expect(Object.isFrozen(NoopLogger)).toBe(true);
  });

  it('NoopLogger methods do not throw', () => {
    expect(() => {
      NoopLogger.debug('test');
    }).not.toThrow();
    expect(() => {
      NoopLogger.info('test', { key: 'value' });
    }).not.toThrow();
    expect(() => {
      NoopLogger.warn('test');
    }).not.toThrow();
    expect(() => {
      NoopLogger.error('test', { error: new Error('real') });
    }).not.toThrow();
  });

  it('NoopLogger methods are all unique function references', () => {
    expect(NoopLogger.debug).not.toBe(NoopLogger.info);
    expect(NoopLogger.info).not.toBe(NoopLogger.warn);
    expect(NoopLogger.warn).not.toBe(NoopLogger.error);
  });
});

describe('ILogger custom implementation', () => {
  it('custom logger receives structured context', () => {
    const calls: { level: string; message: string; context?: Record<string, unknown> }[] = [];
    const logger: ILogger = {
      debug: (msg, ctx) =>
        calls.push({ level: 'debug', message: msg, context: ctx as Record<string, unknown> }),
      info: (msg, ctx) =>
        calls.push({ level: 'info', message: msg, context: ctx as Record<string, unknown> }),
      warn: (msg, ctx) =>
        calls.push({ level: 'warn', message: msg, context: ctx as Record<string, unknown> }),
      error: (msg, ctx) =>
        calls.push({ level: 'error', message: msg, context: ctx as Record<string, unknown> }),
    };

    logger.error('disk full', { operation: 'write', diskUsage: 99 });
    logger.info('pipeline complete', { recordsProcessed: 5000 });

    expect(calls).toHaveLength(2);
    expect(calls[0]!).toMatchObject({ level: 'error', message: 'disk full' });
    expect(calls[0]!.context).toMatchObject({ operation: 'write', diskUsage: 99 });
    expect(calls[1]!).toMatchObject({ level: 'info', message: 'pipeline complete' });
  });
});
