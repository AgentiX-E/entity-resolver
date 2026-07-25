// Tests for logging and health check modules.
import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger, logger } from '../logging/logger.js';
import { getHealth, registerHealthComponent } from '../logging/health.js';

describe('Logger', () => {
  it('creates a named logger', () => {
    const log = createLogger('test-component');
    expect(log).toBeDefined();
    expect(log.level).toBeDefined();
  });

  it('default logger is available', () => {
    expect(logger).toBeDefined();
  });

  it('respects LOG_LEVEL from config', () => {
    const log = createLogger('test', 'debug');
    expect(log.level).toBe('debug');
  });
});

describe('Health check', () => {
  beforeEach(() => {
    // Reset component states by re-registering fresh
    registerHealthComponent('core', () => ({ status: 'ok', message: 'Core engine operational' }));
  });

  it('returns default health with no components', () => {
    const result = getHealth();
    expect(result.status).toBe('ok');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeTruthy();
    expect(result.memory).toBeDefined();
    expect(result.memory.heapUsed).toBeGreaterThan(0);
  });

  it('includes registered component status', () => {
    registerHealthComponent('database', () => ({ status: 'ok', message: 'Connected' }));
    const result = getHealth();
    expect(result.components.database).toBeDefined();
    expect(result.components.database!.status).toBe('ok');
  });

  it('reports degraded when component is degraded', () => {
    registerHealthComponent('cache', () => ({ status: 'degraded', message: 'Slow response' }));
    const result = getHealth();
    expect(result.status).toBe('degraded');
  });

  it('reports unavailable when component is unavailable', () => {
    registerHealthComponent('wasm', () => ({ status: 'unavailable', message: 'WASM not loaded' }));
    const result = getHealth();
    expect(result.status).toBe('unavailable');
  });

  it('unavailable overrides degraded', () => {
    registerHealthComponent('db', () => ({ status: 'degraded' }));
    registerHealthComponent('cache', () => ({ status: 'unavailable' }));
    const result = getHealth();
    expect(result.status).toBe('unavailable');
  });
});
