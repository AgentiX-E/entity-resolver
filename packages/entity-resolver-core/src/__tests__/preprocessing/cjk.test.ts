// CJK normalization tests — validates fullwidth, katakana, NFKC, and edge cases.
import { describe, it, expect } from 'vitest';
import { normalizeCJK, normalize } from '../../preprocessing/cleaner.js';

describe('normalizeCJK', () => {
  it('converts fullwidth ASCII to halfwidth', () => {
    // FULLWIDTH LATIN CAPITAL LETTER M is U+FF2D
    const input = '\uFF2D\uFF49\uFF43\uFF52\uFF4F\uFF53\uFF4F\uFF46\uFF54';
    expect(normalizeCJK(input)).toBe('Microsoft');
  });

  it('converts fullwidth digits to halfwidth', () => {
    // FULLWIDTH DIGIT THREE is U+FF13
    expect(normalizeCJK('\uFF11\uFF12\uFF13')).toBe('123');
  });

  it('converts fullwidth space to halfwidth space', () => {
    expect(normalizeCJK('hello\u3000world')).toBe('hello world');
  });

  it('converts katakana to hiragana', () => {
    // Katakana: コンピュータ → hiragana: こんぴゅーた
    const katakana = '\u30B3\u30F3\u30D4\u30E5\u30FC\u30BF';
    const hiragana = '\u3053\u3093\u3074\u3085\u30FC\u305F';
    expect(normalizeCJK(katakana)).toBe(hiragana);
  });

  it('NFKC normalizes compatibility characters', () => {
    // Roman numeral IV → IV (NFKC decomposes)
    expect(normalizeCJK('\u2163')).toBe('IV');
  });

  it('is idempotent for ASCII', () => {
    expect(normalizeCJK('Hello World 123')).toBe('Hello World 123');
  });

  it('handles empty string', () => {
    expect(normalizeCJK('')).toBe('');
  });

  it('handles mixed CJK + ASCII', () => {
    const input = '\uFF34\uFF2F\uFF2B\uFF39\uFF2F \u6771\u4EAC'; // TOKYO 東京
    expect(normalizeCJK(input)).toBe('TOKYO 東京');
  });

  it('normalize() includes CJK normalization', () => {
    // Fullwidth uppercase WITH smart quotes
    const input = '\uFF28\uFF45\uFF4C\uFF4C\uFF4F\u2019\uFF53';
    expect(normalize(input)).toBe("hello's");
  });

  it('handles Chinese characters unchanged', () => {
    const input = '北京市朝阳区';
    expect(normalizeCJK(input)).toBe(input);
  });

  it('handles Korean Hangul', () => {
    // 가 (U+AC00) is pre-composed — NFKC doesn't change it
    expect(normalizeCJK('가')).toBe('가');
  });
});
