// Tests for EM key parsing and level ordering (C6 + C7 fixes).
import { describe, it, expect } from 'vitest';
import { fieldFromKey } from '../../index.js';

describe('fieldFromKey (C7 — colons in field names)', () => {
  it('extracts field from normal key "name:exact_match"', () => {
    expect(fieldFromKey('name:exact_match')).toBe('name');
  });

  it('extracts field when key has special chars "date_of_birth:weak_match"', () => {
    expect(fieldFromKey('date_of_birth:weak_match')).toBe('date_of_birth');
  });

  it('handles colon in field name "location:city:exact_match"', () => {
    expect(fieldFromKey('location:city:exact_match')).toBe('location:city');
  });

  it('handles multiple colons "a:b:c:d:match_level"', () => {
    expect(fieldFromKey('a:b:c:d:match_level')).toBe('a:b:c:d');
  });

  it('returns key as-is when no colon present', () => {
    expect(fieldFromKey('no_colon_key')).toBe('no_colon_key');
  });

  it('handles empty string', () => {
    expect(fieldFromKey('')).toBe('');
  });

  it('handles key ending with colon (edge case)', () => {
    expect(fieldFromKey('field:')).toBe('field');
  });

  it('handles key starting with colon (edge case)', () => {
    expect(fieldFromKey(':level')).toBe('');
  });

  it('works with numeric field names', () => {
    expect(fieldFromKey('123:exact_match')).toBe('123');
  });

  it('preserves special characters in field name', () => {
    expect(fieldFromKey('user.email@domain.com:strong_match')).toBe('user.email@domain.com');
  });
});
