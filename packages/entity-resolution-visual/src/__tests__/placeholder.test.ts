import { describe, it, expect } from 'vitest';
import { PACKAGE_NAME } from '../index.js';

describe('entity-resolution-visual', () => {
  it('should export its package name', () => {
    expect(PACKAGE_NAME).toBe('@agentix-e/entity-resolution-visual');
  });
});
