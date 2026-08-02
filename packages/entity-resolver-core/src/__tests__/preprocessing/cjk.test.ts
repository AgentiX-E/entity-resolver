/**
 * Comprehensive tests for CJK-Native preprocessing (I37).
 *
 * Covers: CJK detection, tokenizer, S↔T normalization, name parsing,
 * honorific stripping, mixed-script handling, edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  isCJK,
  hasCJK,
  cjkTokenize,
  simplifiedToTraditional,
  traditionalToSimplified,
  areSTVariants,
  parseCJKName,
  stripCJKHonorifics,
} from '../../preprocessing/cjk.js';

// ═══════════════════════════════════════════════════════════════
// CJK detection
// ═══════════════════════════════════════════════════════════════

describe('isCJK', () => {
  it('detects Chinese characters', () => {
    expect(isCJK('中')).toBe(true);
    expect(isCJK('文')).toBe(true);
    expect(isCJK('张')).toBe(true);
    expect(isCJK('龍')).toBe(true);
  });

  it('detects Japanese characters', () => {
    expect(isCJK('あ')).toBe(true);  // hiragana
    expect(isCJK('ア')).toBe(true);  // katakana
    expect(isCJK('日')).toBe(true);  // kanji
  });

  it('detects Korean characters', () => {
    expect(isCJK('한')).toBe(true);  // hangul
    expect(isCJK('글')).toBe(true);
  });

  it('returns false for Latin characters', () => {
    expect(isCJK('A')).toBe(false);
    expect(isCJK('z')).toBe(false);
    expect(isCJK('0')).toBe(false);
    expect(isCJK(' ')).toBe(false);
  });

  it('returns false for punctuation', () => {
    expect(isCJK(',')).toBe(false);
    expect(isCJK('.')).toBe(false);
    expect(isCJK('!')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCJK('')).toBe(false);
  });
});

describe('hasCJK', () => {
  it('detects CJK in mixed text', () => {
    expect(hasCJK('Hello 世界')).toBe(true);
    expect(hasCJK('John Smith 田中')).toBe(true);
  });

  it('returns false for pure Latin', () => {
    expect(hasCJK('Hello World')).toBe(false);
    expect(hasCJK('abc123')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasCJK('')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// CJK tokenizer
// ═══════════════════════════════════════════════════════════════

describe('cjkTokenize', () => {
  it('generates unigrams and bigrams for CJK text', () => {
    const tokens = cjkTokenize('张三');
    // Unigrams: 张, 三; Bigrams: 张三
    expect(tokens).toContain('张');
    expect(tokens).toContain('三');
    expect(tokens).toContain('张三');
  });

  it('preserves Latin words as whole tokens', () => {
    const tokens = cjkTokenize('John Smith');
    expect(tokens).toContain('john');
    expect(tokens).toContain('smith');
    expect(tokens).not.toContain('jo');  // No Latin bigrams
  });

  it('handles mixed CJK+Latin text', () => {
    const tokens = cjkTokenize('John 说 Hello');
    expect(tokens).toContain('john');
    expect(tokens).toContain('说');
    expect(tokens).toContain('hello');
  });

  it('handles three-character CJK names', () => {
    const tokens = cjkTokenize('王小明');
    expect(tokens).toContain('王');
    expect(tokens).toContain('小');
    expect(tokens).toContain('明');
    expect(tokens).toContain('王小');
    expect(tokens).toContain('小明');
  });

  it('handles Japanese mixed script', () => {
    const tokens = cjkTokenize('東京タワー');
    expect(tokens).toContain('東');
    expect(tokens).toContain('京');
    expect(tokens).toContain('東京');
    expect(tokens).toContain('京タ');
    expect(tokens).toContain('タワ');
  });

  it('handles Korean Hangul', () => {
    const tokens = cjkTokenize('한국');
    expect(tokens).toContain('한');
    expect(tokens).toContain('국');
    expect(tokens).toContain('한국');
  });

  it('handles numbers in mixed text', () => {
    const tokens = cjkTokenize('Room 101 张');
    expect(tokens).toContain('room');
    expect(tokens).toContain('101');
    expect(tokens).toContain('张');
  });

  it('skips punctuation and whitespace between CJK chars', () => {
    // Comma breaks the CJK sequence — no bigram across punctuation
    const tokens = cjkTokenize('张, 三');
    expect(tokens).toContain('张');
    expect(tokens).toContain('三');
    expect(tokens).not.toContain('张三'); // Punctuation breaks bigram
    expect(tokens).not.toContain(',');
  });

  it('returns empty array for empty input', () => {
    expect(cjkTokenize('')).toEqual([]);
    expect(cjkTokenize('   ')).toEqual([]);
  });

  it('handles very long CJK text', () => {
    const tokens = cjkTokenize('中华人民共和国');
    expect(tokens).toContain('中');
    expect(tokens).toContain('华');
    expect(tokens).toContain('国');
    expect(tokens).toContain('中华');
    expect(tokens).toContain('人民');
    expect(tokens).toContain('共和');
  });
});

// ═══════════════════════════════════════════════════════════════
// S↔T normalization
// ═══════════════════════════════════════════════════════════════

describe('simplifiedToTraditional', () => {
  it('converts common single-character pairs', () => {
    expect(simplifiedToTraditional('个')).toBe('個');
    expect(simplifiedToTraditional('为')).toBe('為');
    expect(simplifiedToTraditional('门')).toBe('門');
    expect(simplifiedToTraditional('国')).toBe('國');
  });

  it('converts mixed text', () => {
    const result = simplifiedToTraditional('中国人');
    expect(result).toBe('中國人'); // 中→中 (no change), 国→國, 人→人 (no change)
  });

  it('preserves characters not in dictionary', () => {
    expect(simplifiedToTraditional('Hello')).toBe('Hello');
    expect(simplifiedToTraditional('123')).toBe('123');
  });

  it('handles empty string', () => {
    expect(simplifiedToTraditional('')).toBe('');
  });
});

describe('traditionalToSimplified', () => {
  it('converts common single-character pairs', () => {
    expect(traditionalToSimplified('個')).toBe('个');
    expect(traditionalToSimplified('為')).toBe('为');
    expect(traditionalToSimplified('門')).toBe('门');
    expect(traditionalToSimplified('國')).toBe('国');
  });

  it('handles empty string', () => {
    expect(traditionalToSimplified('')).toBe('');
  });
});

describe('areSTVariants', () => {
  it('detects S→T variants', () => {
    expect(areSTVariants('中国', '中國')).toBe(true);
  });

  it('detects T→S variants', () => {
    expect(areSTVariants('學習', '学习')).toBe(true);
  });

  it('returns false for non-variants', () => {
    expect(areSTVariants('中国', '日本')).toBe(false);
    expect(areSTVariants('Hello', 'World')).toBe(false);
  });

  it('is symmetric', () => {
    expect(areSTVariants('中国', '中國')).toBe(areSTVariants('中國', '中国'));
  });

  it('handles identical strings', () => {
    expect(areSTVariants('中文', '中文')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// CJK name parsing
// ═══════════════════════════════════════════════════════════════

describe('parseCJKName', () => {
  it('parses single-character surname names', () => {
    const result = parseCJKName('王小明');
    expect(result).not.toBeNull();
    expect(result!.surname).toBe('王');
    expect(result!.givenName).toBe('小明');
    expect(result!.isCompound).toBe(false);
  });

  it('parses double-character surname names', () => {
    const result = parseCJKName('欧阳修');
    expect(result).not.toBeNull();
    expect(result!.surname).toBe('欧阳');
    expect(result!.givenName).toBe('修');
    expect(result!.isCompound).toBe(true);
  });

  it('parses common surnames correctly', () => {
    const names: Array<[string, string, string]> = [
      ['李四', '李', '四'],
      ['张三丰', '张', '三丰'],
      ['司马光', '司马', '光'],
      ['诸葛亮', '诸葛', '亮'],
    ];
    for (const [full, expectedSurname, expectedGiven] of names) {
      const result = parseCJKName(full);
      expect(result).not.toBeNull();
      expect(result!.surname).toBe(expectedSurname);
      expect(result!.givenName).toBe(expectedGiven);
    }
  });

  it('returns null for non-CJK names', () => {
    expect(parseCJKName('John Smith')).toBeNull();
    expect(parseCJKName('abc')).toBeNull();
  });

  it('returns null for too-short names', () => {
    expect(parseCJKName('王')).toBeNull();
    expect(parseCJKName('')).toBeNull();
  });

  it('returns null when first char is not a surname', () => {
    expect(parseCJKName('的士')).toBeNull(); // Neither is a surname
  });
});

describe('stripCJKHonorifics', () => {
  it('strips 先生 suffix', () => {
    expect(stripCJKHonorifics('王先生')).toBe('王');
  });

  it('strips 女士 suffix', () => {
    expect(stripCJKHonorifics('李女士')).toBe('李');
  });

  it('strips Japanese さん suffix', () => {
    expect(stripCJKHonorifics('田中さん')).toBe('田中');
  });

  it('does not modify names without honorifics', () => {
    expect(stripCJKHonorifics('王小明')).toBe('王小明');
  });

  it('handles empty string', () => {
    expect(stripCJKHonorifics('')).toBe('');
  });
});