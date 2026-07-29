import { describe, it, expect } from 'vitest';
import { coerce, coerceAll } from '../../normalization/type-coercion.js';

describe('coerce', () => {
  // ── String ──
  describe('string', () => {
    it('passes through string values', () => {
      const result = coerce('hello', 'string');
      expect(result.success).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('trims whitespace', () => {
      const result = coerce('  hello  ', 'string');
      expect(result.value).toBe('hello');
    });

    it('converts number to string', () => {
      const result = coerce(42, 'string');
      expect(result.success).toBe(true);
      expect(result.value).toBe('42');
    });

    it('rejects empty string', () => {
      const result = coerce('  ', 'string');
      expect(result.success).toBe(false);
    });

    it('rejects null', () => {
      const result = coerce(null, 'string');
      expect(result.success).toBe(false);
    });
  });

  // ── Number ──
  describe('number', () => {
    it('coerces numeric string', () => {
      const result = coerce('42', 'number');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('coerces float string', () => {
      const result = coerce('3.14', 'number');
      expect(result.success).toBe(true);
      expect(result.value).toBe(3.14);
    });

    it('coerces negative number', () => {
      const result = coerce('-10', 'number');
      expect(result.success).toBe(true);
      expect(result.value).toBe(-10);
    });

    it('strips thousand separators', () => {
      const result = coerce('1,234,567', 'number');
      expect(result.success).toBe(true);
      expect(result.value).toBe(1234567);
    });

    it('handles percentage', () => {
      const result = coerce('25%', 'number');
      expect(result.success).toBe(true);
      expect(result.value).toBe(0.25);
    });

    it('handles currency symbol', () => {
      const result = coerce('$99.99', 'number');
      expect(result.success).toBe(true);
      expect(result.value).toBe(99.99);
    });

    it('passes through number type', () => {
      const result = coerce(42, 'number');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('rejects non-numeric string', () => {
      const result = coerce('hello', 'number');
      expect(result.success).toBe(false);
    });
  });

  // ── Integer ──
  describe('integer', () => {
    it('coerces numeric string to integer', () => {
      const result = coerce('42', 'integer');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('rounds float to integer', () => {
      const result = coerce('3.14', 'integer');
      expect(result.success).toBe(true);
      expect(result.value).toBe(3);
    });

    it('passes through integer type', () => {
      const result = coerce(42, 'integer');
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
    });

    it('rejects non-numeric', () => {
      const result = coerce('abc', 'integer');
      expect(result.success).toBe(false);
    });
  });

  // ── Boolean ──
  describe('boolean', () => {
    it('coerces "true"', () => {
      expect(coerce('true', 'boolean').value).toBe(true);
    });
    it('coerces "false"', () => {
      expect(coerce('false', 'boolean').value).toBe(false);
    });
    it('coerces "yes"', () => {
      expect(coerce('yes', 'boolean').value).toBe(true);
    });
    it('coerces "no"', () => {
      expect(coerce('no', 'boolean').value).toBe(false);
    });
    it('coerces "1"', () => {
      expect(coerce('1', 'boolean').value).toBe(true);
    });
    it('coerces "0"', () => {
      expect(coerce('0', 'boolean').value).toBe(false);
    });
    it('coerces Chinese 是', () => {
      expect(coerce('是', 'boolean').value).toBe(true);
    });
    it('coerces Chinese 否', () => {
      expect(coerce('否', 'boolean').value).toBe(false);
    });
    it('passes through boolean type', () => {
      expect(coerce(true, 'boolean').value).toBe(true);
    });

    it('rejects non-boolean', () => {
      const result = coerce('maybe', 'boolean');
      expect(result.success).toBe(false);
    });
  });

  // ── Date ──
  describe('date', () => {
    it('coerces ISO date string', () => {
      const result = coerce('2024-01-15', 'date');
      expect(result.success).toBe(true);
      expect(result.value).toBeInstanceOf(Date);
    });

    it('coerces ISO datetime string', () => {
      const result = coerce('2024-01-15T14:30:00Z', 'date');
      expect(result.success).toBe(true);
    });

    it('passes through Date object', () => {
      const d = new Date('2024-01-15');
      const result = coerce(d, 'date');
      expect(result.success).toBe(true);
      expect(result.value).toBe(d);
    });

    it('rejects non-date string', () => {
      const result = coerce('hello', 'date');
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = coerce('', 'date');
      expect(result.success).toBe(false);
    });
  });

  // ── Time ──
  describe('time', () => {
    it('accepts HH:MM:SS format', () => {
      const result = coerce('14:30:00', 'time');
      expect(result.success).toBe(true);
      expect(result.value).toBe('14:30:00');
    });

    it('accepts HH:MM format and auto-fills seconds', () => {
      const result = coerce('14:30', 'time');
      expect(result.success).toBe(true);
      expect(result.value).toBe('14:30:00');
    });

    it('rejects non-time text', () => {
      const result = coerce('afternoon', 'time');
      expect(result.success).toBe(false);
    });
  });

  // ── Edge cases ──
  describe('edge cases', () => {
    it('handles undefined', () => {
      const result = coerce(undefined, 'string');
      expect(result.success).toBe(false);
    });

    it('handles null', () => {
      const result = coerce(null, 'number');
      expect(result.success).toBe(false);
    });

    it('unknown target type passes through as string', () => {
      const result = coerce(42, 'unknown' as never);
      expect(result.success).toBe(true);
      expect(result.value).toBe('42');
    });
  });
});

describe('coerceAll', () => {
  it('coerces multiple fields at once', () => {
    const results = coerceAll(
      { name: 'John', age: '42', active: 'true' },
      { name: 'string', age: 'number', active: 'boolean' },
    );
    expect(results.get('name')!.value).toBe('John');
    expect(results.get('age')!.value).toBe(42);
    expect(results.get('active')!.value).toBe(true);
  });

  it('falls back to string for unknown types', () => {
    const results = coerceAll(
      { x: 'hello' },
      {},
    );
    expect(results.get('x')!.value).toBe('hello');
    expect(results.get('x')!.targetType).toBe('string');
  });

  it('marks failed coercions', () => {
    const results = coerceAll(
      { x: 'hello' },
      { x: 'number' as never },
    );
    expect(results.get('x')!.success).toBe(false);
  });
});
