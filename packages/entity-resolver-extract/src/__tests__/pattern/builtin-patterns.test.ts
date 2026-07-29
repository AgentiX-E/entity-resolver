import { describe, it, expect } from 'vitest';
import { builtinMatchers } from '../../pattern/builtin-patterns.js';

// ─── Email ───────────────────────────────────────────────────────────

describe('builtin email matcher', () => {
  const matcher = builtinMatchers.email!;

  it('extracts simple email', () => {
    const result = matcher.extract('contact@example.com');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('contact@example.com');
    expect(result[0]!.confidence).toBeGreaterThan(0.7); // example.com is a disposable domain → lowered confidence
  });

  it('extracts email from surrounding text', () => {
    const result = matcher.extract('Please contact john.doe@company.co.uk for details');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('john.doe@company.co.uk');
  });

  it('extracts email with plus addressing', () => {
    const result = matcher.extract('Send to user+tag@domain.com');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('user+tag@domain.com');
  });

  it('returns empty for non-email text', () => {
    const result = matcher.extract('hello world');
    expect(result).toHaveLength(0);
  });

  it('returns empty for invalid email format', () => {
    // Missing @
    const result = matcher.extract('notanemail');
    expect(result).toHaveLength(0);
  });

  it('penalizes disposable domains', () => {
    const result = matcher.extract('test@example.com');
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBeLessThan(0.9);
  });

  it('extracts first email when multiple present', () => {
    const result = matcher.extract('a@b.com c@d.com');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('a@b.com');
  });

  it('normalizes to lowercase', () => {
    const result = matcher.extract('User@Example.COM');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('user@example.com');
  });
});

// ─── Phone ───────────────────────────────────────────────────────────

describe('builtin phone matcher', () => {
  const matcher = builtinMatchers.phone!;

  it('extracts international phone with +', () => {
    const result = matcher.extract('Call me at +86-138-0000-0000');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toContain('86');
    expect(result[0]!.confidence).toBeGreaterThan(0.8);
  });

  it('extracts phone with parentheses', () => {
    const result = matcher.extract('Office: (010) 1234-5678');
    expect(result).toHaveLength(1);
  });

  it('extracts plain digit phone', () => {
    const result = matcher.extract('Call 13800000000 for info');
    expect(result).toHaveLength(1);
  });

  it('extracts US format phone', () => {
    const result = matcher.extract('1-800-555-0199 is the number');
    expect(result).toHaveLength(1);
  });

  it('rejects too-short numbers', () => {
    const result = matcher.extract('Call 123');
    expect(result).toHaveLength(0);
  });
});

// ─── URL ─────────────────────────────────────────────────────────────

describe('builtin url matcher', () => {
  const matcher = builtinMatchers.url!;

  it('extracts https URL', () => {
    const result = matcher.extract('Visit https://example.com/path?q=1');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('https://example.com/path?q=1');
    expect(result[0]!.confidence).toBeGreaterThan(0.9);
  });

  it('extracts URL without protocol', () => {
    const result = matcher.extract('Go to www.example.com');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('https://www.example.com');
    expect(result[0]!.confidence).toBeLessThan(0.9);
  });

  it('extracts URL with subdomain', () => {
    const result = matcher.extract('api.github.com/repos');
    expect(result).toHaveLength(1);
  });

  it('returns empty for non-URL text', () => {
    const result = matcher.extract('just some words');
    expect(result).toHaveLength(0);
  });
});

// ─── Number ──────────────────────────────────────────────────────────

describe('builtin number matcher', () => {
  const matcher = builtinMatchers.number!;

  it('extracts integer', () => {
    const result = matcher.extract('There are 42 items');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(42);
  });

  it('extracts float', () => {
    const result = matcher.extract('Price is 3.14 dollars');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(3.14);
  });

  it('extracts negative number', () => {
    const result = matcher.extract('Temperature is -5 degrees');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(-5);
  });

  it('extracts number with thousand separators', () => {
    const result = matcher.extract('Population: 1,234,567');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(1234567);
  });

  it('extracts percentage', () => {
    const result = matcher.extract('Discount: 25% off');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(0.25);
  });

  it('extracts currency amount', () => {
    const result = matcher.extract('The cost is $99.99');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(99.99);
  });

  it('extracts scientific notation', () => {
    const result = matcher.extract('Value: 1.5e10');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(1.5e10);
  });

  it('returns empty for non-number text', () => {
    const result = matcher.extract('hello world');
    expect(result).toHaveLength(0);
  });
});

// ─── Integer ─────────────────────────────────────────────────────────

describe('builtin integer matcher', () => {
  const matcher = builtinMatchers.integer!;

  it('extracts positive integer', () => {
    const result = matcher.extract('There are 100 apples');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(100);
  });

  it('extracts negative integer', () => {
    const result = matcher.extract('Balance is -50');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(-50);
  });

  it('does not match float (has decimal)', () => {
    // The integer regex should not match standalone floats
    const result = matcher.extract('pi is 3.14');
    expect(result).toHaveLength(0);
  });

  it('extracts integer with thousand separators', () => {
    const result = matcher.extract('Total: 2,500');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(2500);
  });
});

// ─── Boolean ─────────────────────────────────────────────────────────

describe('builtin boolean matcher', () => {
  const matcher = builtinMatchers.boolean!;

  it('extracts true', () => {
    const result = matcher.extract('The answer is true');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(true);
  });

  it('extracts false', () => {
    const result = matcher.extract('The answer is false');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(false);
  });

  it('extracts yes as true', () => {
    const result = matcher.extract('Are you sure? yes');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(true);
  });

  it('extracts no as false', () => {
    const result = matcher.extract('Option: no');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(false);
  });

  it('extracts Chinese 是 as true', () => {
    const result = matcher.extract('答案是 是');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(true);
  });

  it('extracts Chinese 否 as false', () => {
    const result = matcher.extract('决定: 否');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(false);
  });

  it('extracts on/off', () => {
    expect(builtinMatchers.boolean!.extract('Switch is on')[0]!.value).toBe(true);
    expect(builtinMatchers.boolean!.extract('Switch is off')[0]!.value).toBe(false);
  });

  it('extracts numeric 1/0 as boolean', () => {
    expect(builtinMatchers.boolean!.extract('flag: 1')[0]!.value).toBe(true);
    expect(builtinMatchers.boolean!.extract('flag: 0')[0]!.value).toBe(false);
  });

  it('returns empty for non-boolean text', () => {
    const result = matcher.extract('maybe');
    expect(result).toHaveLength(0);
  });
});

// ─── Date ────────────────────────────────────────────────────────────

describe('builtin date matcher', () => {
  const matcher = builtinMatchers.date!;

  it('extracts ISO 8601 date', () => {
    const result = matcher.extract('Meeting on 2024-01-15');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBeInstanceOf(Date);
    const d = result[0]!.value as Date;
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(0); // January
    expect(d.getUTCDate()).toBe(15);
  });

  it('extracts ISO 8601 datetime', () => {
    const result = matcher.extract('Event at 2024-06-15T14:30:00');
    expect(result).toHaveLength(1);
    const d = result[0]!.value as Date;
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(30);
  });

  it('extracts slash format date', () => {
    const result = matcher.extract('Due: 2024/03/20');
    expect(result).toHaveLength(1);
    const d = result[0]!.value as Date;
    expect(d.getUTCMonth()).toBe(2); // March
  });

  it('extracts named month format (MMM DD YYYY)', () => {
    const result = matcher.extract('Published on Jan 15 2024');
    expect(result).toHaveLength(1);
    const d = result[0]!.value as Date;
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
  });

  it('extracts named month format with comma', () => {
    const result = matcher.extract('Date: January 15, 2024');
    expect(result).toHaveLength(1);
    const d = result[0]!.value as Date;
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
  });

  it('extracts DD MMM YYYY format', () => {
    const result = matcher.extract('Birthday: 15 January 2024');
    expect(result).toHaveLength(1);
    const d = result[0]!.value as Date;
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCFullYear()).toBe(2024);
  });

  it('returns empty for non-date text', () => {
    const result = matcher.extract('hello world');
    expect(result).toHaveLength(0);
  });
});

// ─── Time ────────────────────────────────────────────────────────────

describe('builtin time matcher', () => {
  const matcher = builtinMatchers.time!;

  it('extracts 24h time', () => {
    const result = matcher.extract('Meeting at 14:30');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('14:30:00');
  });

  it('extracts 12h time with AM', () => {
    const result = matcher.extract('Wake up at 7:30 AM');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('07:30:00');
  });

  it('extracts 12h time with PM', () => {
    const result = matcher.extract('Dinner at 7:30 PM');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('19:30:00');
  });

  it('extracts time with seconds', () => {
    const result = matcher.extract('Timestamp: 14:30:45');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('14:30:45');
  });

  it('handles bare hour without colon or minutes', () => {
    const result = matcher.extract('lunch at 12');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('12:00:00');
  });

  it('handles 12 PM correctly', () => {
    const result = matcher.extract('Noon at 12 PM');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('12:00:00'); // 12 PM = 12:00
  });

  it('handles 12 AM correctly', () => {
    const result = matcher.extract('Midnight at 12 AM');
    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe('00:00:00');
  });

  it('rejects invalid hours', () => {
    const result = matcher.extract('Time: 99:99');
    expect(result).toHaveLength(0);
  });

  it('rejects invalid minutes', () => {
    const result = matcher.extract('Time: 14:60');
    expect(result).toHaveLength(0);
  });

  it('rejects invalid seconds', () => {
    const result = matcher.extract('Time: 14:30:99');
    expect(result).toHaveLength(0);
  });

  it('rejects hours outside 0-23 range', () => {
    const result = matcher.extract('Time: 25:00');
    expect(result).toHaveLength(0);
  });

  it('returns empty for non-time text', () => {
    const result = matcher.extract('just text');
    expect(result).toHaveLength(0);
  });
});
