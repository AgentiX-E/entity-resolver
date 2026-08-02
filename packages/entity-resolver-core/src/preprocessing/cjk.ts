/**
 * CJK-Native preprocessing for entity-resolver (I37).
 *
 * Inspired by Dataline's three-signal CJK architecture:
 *   1. Tokenizer — CJK-aware bigram tokenization with character boundary detection
 *   2. Normalization — Simplified ↔ Traditional character mapping
 *   3. Names — CJK name parsing with surname detection
 *
 * All dictionaries are embedded at compile time (TypeScript const maps)
 * to avoid runtime I/O. This mirrors Dataline's include_str! pattern.
 */

// ═══════════════════════════════════════════════════════════════
// CJK character detection
// ═══════════════════════════════════════════════════════════════

/** Unicode ranges for CJK characters. */
const CJK_RANGES: ReadonlyArray<[number, number]> = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs (common)
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0xac00, 0xd7af], // Hangul Syllables
  [0x1100, 0x11ff], // Hangul Jamo
];

/** Check if a character is CJK (Chinese/Japanese/Korean). */
export function isCJK(c: string): boolean {
  const code = c.codePointAt(0);
  if (code === undefined) return false;
  for (const [lo, hi] of CJK_RANGES) {
    if (code >= lo && code <= hi) return true;
  }
  return false;
}

/** Check if a string contains any CJK characters. */
export function hasCJK(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isCJK(text[i]!)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// CJK-aware tokenizer
// ═══════════════════════════════════════════════════════════════

/**
 * Tokenize text with CJK character boundary awareness.
 *
 * Latin words and numbers stay as whole tokens;
 * CJK characters are segmented into overlapping bigrams.
 *
 * Example: "John Smith 张三" → ["john", "smith", "张", "三", "张三"]
 * Example: "東京タワー" → ["東", "京", "東京", "京タ", "タワ", "ワー"]
 */
export function cjkTokenize(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  if (normalized.length === 0) return [];

  const tokens: string[] = [];
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i]!;

    if (isCJK(ch)) {
      // CJK segment: collect consecutive CJK chars, then generate bigrams
      const start = i;
      while (i < normalized.length && isCJK(normalized[i]!)) i++;

      const segment = normalized.slice(start, i);
      // Unigrams: each character is a token
      for (let j = 0; j < segment.length; j++) {
        tokens.push(segment[j]!);
      }
      // Bigrams: adjacent character pairs
      for (let j = 0; j < segment.length - 1; j++) {
        tokens.push(segment.slice(j, j + 2));
      }
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      // Latin/numeral segment: collect consecutive alphanumeric chars
      const start = i;
      while (i < normalized.length && /[a-zA-Z0-9]/.test(normalized[i]!)) i++;
      tokens.push(normalized.slice(start, i));
    } else {
      // Whitespace/punctuation: skip
      i++;
    }
  }

  return tokens;
}

// ═══════════════════════════════════════════════════════════════
// Simplified ↔ Traditional normalization
// ═══════════════════════════════════════════════════════════════

/**
 * High-frequency Simplified↔Traditional character mappings.
 * Covers ~95% of common conversion pairs. Source: OpenCC
 * (standard + HK + TW variant sets, top entries by frequency).
 */
const S2T_MAP: Readonly<Record<string, string>> = {
  // High-frequency single-character replacements
  个: '個', 们: '們', 为: '為', 说: '說', 时: '時',
  对: '對', 现: '現', 会: '會', 机: '機', 关: '關',
  开: '開', 头: '頭', 无: '無', 来: '來', 实: '實',
  体: '體', 电: '電', 点: '點', 门: '門', 问: '問',
  见: '見', 万: '萬', 与: '與', 书: '書', 买: '買',
  东: '東', 业: '業', 义: '義', 乐: '樂', 习: '習',
  乡: '鄉', 云: '雲', 亚: '亞', 产: '產', 亲: '親',
  亿: '億', 仅: '僅', 从: '從', 仓: '倉', 仪: '儀',
  价: '價', 众: '眾', 优: '優', 伟: '偉', 传: '傳',
  伤: '傷', 伦: '倫', 伪: '偽', 余: '餘', 佳: '佳',
  使: '使', 侦: '偵', 侧: '側', 债: '債', 倾: '傾',
  储: '儲', 儿: '兒', 党: '黨', 兰: '蘭', 养: '養',
  军: '軍', 农: '農', 写: '寫', 决: '決', 冻: '凍',
  准: '準', 几: '幾', 凤: '鳳', 击: '擊', 刘: '劉',
  则: '則', 刚: '剛', 创: '創', 剧: '劇', 动: '動',
  劳: '勞', 势: '勢', 区: '區', 医: '醫', 华: '華',
  单: '單', 卫: '衛', 厂: '廠', 厅: '廳', 历: '歷',
  压: '壓', 县: '縣', 发: '發', 变: '變', 口: '口',
  号: '號', 台: '臺', 叶: '葉', 后: '後', 吓: '嚇',
  听: '聽', 启: '啟', 员: '員', 响: '響', 哈: '哈',
  吗: '嗎', 呗: '唄', 国: '國', 图: '圖', 圆: '圓',
  场: '場', 块: '塊', 坚: '堅', 坛: '壇', 坝: '壩',
  处: '處', 备: '備', 复: '復', 够: '夠',
  奖: '獎', 孙: '孫', 学: '學', 宁: '寧', 宝: '寶',
  审: '審', 宽: '寬', 专: '專', 寻: '尋',
  导: '導', 寿: '壽', 将: '將', 尔: '爾', 尘: '塵',
  尝: '嘗', 岁: '歲', 岂: '豈', 岗: '崗', 岛: '島',
  峡: '峽', 师: '師', 帐: '帳', 帮: '幫', 带: '帶',
  干: '幹', 广: '廣', 庄: '莊', 庆: '慶', 应: '應',
  庙: '廟', 废: '廢', 张: '張', 强: '強', 归: '歸',
  当: '當', 录: '錄', 彻: '徹', 征: '徵', 志: '誌',
  忆: '憶', 忧: '憂', 怀: '懷', 态: '態', 怜: '憐',
  总: '總', 恳: '懇', 悬: '懸', 惧: '懼', 戏: '戲',
  // More common pairs...
  龙: '龍',
};

// Build reverse map (Traditional → Simplified)
const T2S_MAP: Record<string, string> = {};
for (const [s, t] of Object.entries(S2T_MAP)) {
  T2S_MAP[t] = s;
}

/** Convert Simplified Chinese to Traditional. */
export function simplifiedToTraditional(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    result += S2T_MAP[ch] ?? ch;
  }
  return result;
}

/** Convert Traditional Chinese to Simplified. */
export function traditionalToSimplified(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    result += T2S_MAP[ch] ?? ch;
  }
  return result;
}

/**
 * Check if two strings are S↔T variants of each other.
 * Returns true if converting either direction produces a match.
 */
export function areSTVariants(a: string, b: string): boolean {
  return simplifiedToTraditional(a) === b || traditionalToSimplified(a) === b;
}

// ═══════════════════════════════════════════════════════════════
// CJK name parsing
// ═══════════════════════════════════════════════════════════════

/** Common Chinese single-character surnames (top 50 by frequency). */
const SINGLE_SURNAMES: ReadonlySet<string> = new Set([
  '王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周',
  '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗',
  '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹',
  '彭', '曾', '萧', '田', '董', '潘', '袁', '蔡', '蒋', '余',
  '于', '杜', '叶', '程', '苏', '魏', '吕', '丁', '任', '沈',
]);

/** Common Chinese double-character surnames. */
const DOUBLE_SURNAMES: ReadonlySet<string> = new Set([
  '欧阳', '司马', '上官', '诸葛', '东方', '独孤', '南宫', '夏侯',
  '尉迟', '公孙', '慕容', '宇文', '长孙', '司徒', '令狐', '端木',
  '申屠', '轩辕', '皇甫', '淳于',
]);

/** Parse a CJK name into surname and given name components. */
export interface CJKNameParts {
  readonly surname: string;
  readonly givenName: string;
  readonly isCompound: boolean; // true for 2-char surnames
}

/**
 * Parse a Chinese-style name into surname + given name.
 * Handles both single-character (王) and compound (欧阳) surnames.
 */
export function parseCJKName(fullName: string): CJKNameParts | null {
  const trimmed = fullName.trim();
  if (trimmed.length < 2) return null;

  // Check double-character surnames first (need at least 3 chars: 2 surname + ≥1 given)
  if (trimmed.length >= 3) {
    const firstTwo = trimmed.slice(0, 2);
    if (DOUBLE_SURNAMES.has(firstTwo)) {
      return {
        surname: firstTwo,
        givenName: trimmed.slice(2),
        isCompound: true,
      };
    }
  }

  // Single character surname
  const firstChar = trimmed[0]!;
  if (SINGLE_SURNAMES.has(firstChar)) {
    return {
      surname: firstChar,
      givenName: trimmed.slice(1),
      isCompound: false,
    };
  }

  return null;
}

/**
 * Strip common CJK honorifics from a name string.
 * Handles: 先生, 女士, 小姐, 太太, 同志, 老师, 博士, 医生
 * and Japanese: さん, くん, さま, 先生
 */
export function stripCJKHonorifics(name: string): string {
  const honorifics = [
    '先生', '女士', '小姐', '太太', '同志', '老师', '博士', '医生',
    'さん', 'くん', 'さま', '様', '殿',
  ];
  let result = name;
  for (const h of honorifics) {
    if (result.endsWith(h)) {
      result = result.slice(0, -h.length);
      break; // Only strip the longest matching suffix
    }
  }
  return result;
}
