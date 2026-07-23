// Tests for the preprocessing pipeline.

import { describe, it, expect } from 'vitest';
import {
  repairUnicode,
  normalize,
  normalizeEmail,
  normalizePhone,
  preprocessRecords,
} from '../index.js';

describe('repairUnicode', () => {
  it('replaces smart quotes with straight quotes', () => {
    expect(repairUnicode('\u201CHello\u201D')).toBe('"Hello"');
    expect(repairUnicode('\u2018World\u2019')).toBe("'World'");
  });

  it('replaces en-dash and em-dash', () => {
    expect(repairUnicode('a\u2013b')).toBe('a-b');
    expect(repairUnicode('a\u2014b')).toBe('a--b');
  });

  it('replaces non-breaking space', () => {
    expect(repairUnicode('hello\u00A0world')).toBe('hello world');
  });

  it('removes zero-width spaces and BOM', () => {
    expect(repairUnicode('a\u200Bb\uFEFFc')).toBe('abc');
  });

  it('fixes common mojibake', () => {
    // UTF-8 "é" mis-decoded as Latin-1 = "Ã©"
    expect(repairUnicode('cafÃ©')).toBe('café');
  });

  it('removes control characters', () => {
    expect(repairUnicode('hello\u0000world')).toBe('helloworld');
  });

  it('trims whitespace', () => {
    expect(repairUnicode('  hello  ')).toBe('hello');
  });

  it('handles empty strings', () => {
    expect(repairUnicode('')).toBe('');
  });

  it('handles already-clean strings as identity', () => {
    expect(repairUnicode('Hello World 123')).toBe('Hello World 123');
  });
});

describe('normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('  Hello   World  ')).toBe('hello world');
  });

  it('repairs Unicode before normalizing', () => {
    expect(normalize('\u00A0Hello\u2019s World\u201D')).toBe('hello\'s world"');
  });

  it('handles null and undefined', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });

  it('converts non-strings to strings', () => {
    expect(normalize(123)).toBe('123');
    expect(normalize(true)).toBe('true');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and strips whitespace', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('removes dots from Gmail local part', () => {
    expect(normalizeEmail('first.last@gmail.com')).toBe('firstlast@gmail.com');
  });

  it('returns non-email strings as-is', () => {
    expect(normalizeEmail('hello')).toBe('hello');
  });
});

describe('normalizePhone', () => {
  it('strips all non-digit characters', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('15551234567');
  });

  it('handles empty input', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('preprocessRecords', () => {
  it('preprocesses a batch of records in-place', () => {
    const records = [
      { name: '  John  Smith\u2019s  ', email: '  USER@Example.COM  ', age: 30 },
      { name: 'Jane\u00A0Doe', email: 'Jane@Example.COM', age: 25 },
    ];

    preprocessRecords(records, {
      emailFields: ['email'],
    });

    expect(records[0]!.name).toBe("john smith's");
    expect(records[0]!.email).toBe('user@example.com');
    expect(records[0]!.age).toBe(30); // non-string field unchanged
    expect(records[1]!.name).toBe('jane doe');
    expect(records[1]!.email).toBe('jane@example.com');
  });
});

describe('preprocessing edge cases', () => {
  it('repairUnicode removes replacement characters', () => {
    // \uFFFD is the Unicode replacement character
    expect(repairUnicode('test\uFFFDstring')).toBe('teststring');
    expect(repairUnicode('\uFFFD\uFFFD\uFFFD')).toBe('');
  });

  it('repairUnicode fixes trademark and registered symbols', () => {
    expect(repairUnicode('Brand\u2122')).toBe('Brand(TM)');
    expect(repairUnicode('Name\u00AE')).toBe('Name(R)');
  });

  it('repairUnicode handles soft hyphen removal', () => {
    expect(repairUnicode('hy\u00ADphen')).toBe('hyphen');
  });

  it('normalizeEmail handles null gracefully', () => {
    expect(normalizeEmail(null)).toBe('');
  });

  it('normalizePhone handles null gracefully', () => {
    expect(normalizePhone(null)).toBe('');
  });

  it('preprocessRecords handles empty options', () => {
    const records = [{ name: 'Test' }];
    preprocessRecords(records);
    expect(records[0]!.name).toBe('test');
  });

  it('preprocessRecords with phone normalization', () => {
    const records = [{ phone: '+1 (555) 123-4567' }];
    preprocessRecords(records, { phoneFields: ['phone'] });
    expect(records[0]!.phone).toBe('15551234567');
  });
});
