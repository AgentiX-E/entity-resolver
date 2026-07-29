/**
 * CJK temporal vocabulary constants.
 *
 * This module defines the complete lexicon for CJK temporal expression
 * parsing across Chinese (Simplified + Traditional), Japanese, and Korean.
 *
 * Coverage:
 *   - Relative date/time units (today, tomorrow, next week, etc.)
 *   - Day-of-week names
 *   - Month names (numeric + named)
 *   - Chinese sexagenary cycle (干支)
 *   - Japanese era names (令和/平成/昭和/大正/明治)
 *   - Lunar calendar markers (农历, 旧暦)
 *   - Time-of-day markers (morning, afternoon, evening)
 *   - Relative quantifiers (last, next, this, ago, after)
 *   - Temporal prepositions (at, on, during, from...to)
 */

/** ISO day-of-week mapping (0 = Sunday) */
export interface DayOfWeekEntry {
  /** Day-of-week patterns in regex alternation form */
  pattern: RegExp;
  /** ISO weekday 0-6 */
  iso: number;
}

/** Named month entry */
export interface MonthEntry {
  pattern: RegExp;
  /** 1-based month number */
  month: number;
}

// ─── Relative date units ─────────────────────────────────────────────

/** Today / 今天 / 今日 / 本日 / 오늘 */
export const TODAY_PATTERN = /(?:today|今[天日]|本日|오늘|금일)/iu;

/** Tomorrow / 明天 / 明日 / 내일 */
export const TOMORROW_PATTERN = /(?:tomorrow|明[天日]|내일)/iu;

/** Yesterday / 昨天 / 昨日 / 어제 */
export const YESTERDAY_PATTERN = /(?:yesterday|昨[天日]|어제)/iu;

/** Day after tomorrow / 后天 / 明後日 / 모레 */
export const DAY_AFTER_TOMORROW_PATTERN =
  /(?:day\s*after\s*tomorrow|后[天日]|明後日|あさって|모레)/iu;

/** Day before yesterday / 前天 / 一昨日 / 그저께 */
export const DAY_BEFORE_YESTERDAY_PATTERN =
  /(?:day\s*before\s*yesterday|前[天日]|一昨日|おととい|그저께)/iu;

// ─── Day of week ─────────────────────────────────────────────────────

/**
 * Day of week names across CJK languages.
 *
 * Chinese: 星期一～星期日, 周一～周日, 礼拜一～礼拜天
 * Japanese: 月曜日～日曜日
 * Korean: 월요일～일요일
 */
export const DAY_OF_WEEK_PATTERNS: DayOfWeekEntry[] = [
  { pattern: /(?:sunday|星期[天日]|周日|礼拜[天日]|日曜日|일요일)/iu, iso: 0 },
  { pattern: /(?:monday|星期一|周一|礼拜一|月曜日|월요일)/iu, iso: 1 },
  { pattern: /(?:tuesday|星期二|周二|礼拜二|火曜日|화요일)/iu, iso: 2 },
  { pattern: /(?:wednesday|星期三|周三|礼拜三|水曜日|수요일)/iu, iso: 3 },
  { pattern: /(?:thursday|星期四|周四|礼拜四|木曜日|목요일)/iu, iso: 4 },
  { pattern: /(?:friday|星期五|周五|礼拜五|金曜日|금요일)/iu, iso: 5 },
  { pattern: /(?:saturday|星期六|周六|礼拜六|土曜日|토요일)/iu, iso: 6 },
];

/** Weekend patterns */
export const WEEKEND_PATTERN = /(?:weekend|周[末未]|週末|주말)/iu;

// ─── Named months (CJK) ──────────────────────────────────────────────

/**
 * Named month patterns.
 * Chinese: 一月～十二月
 * Japanese: 1月～12月, 睦月～師走 (traditional)
 * Korean: 1월～12월
 */
export const NAMED_MONTHS_CJK: MonthEntry[] = [
  { pattern: /(?:一月|1月|睦月|1월)/iu, month: 1 },
  { pattern: /(?:二月|2月|如月|2월)/iu, month: 2 },
  { pattern: /(?:三月|3月|弥生|3월)/iu, month: 3 },
  { pattern: /(?:四月|4月|卯月|4월)/iu, month: 4 },
  { pattern: /(?:五月|5月|皐月|5월)/iu, month: 5 },
  { pattern: /(?:六月|6月|水無月|6월)/iu, month: 6 },
  { pattern: /(?:七月|7月|文月|7월)/iu, month: 7 },
  { pattern: /(?:八月|8月|葉月|8월)/iu, month: 8 },
  { pattern: /(?:九月|9月|長月|9월)/iu, month: 9 },
  { pattern: /(?:十月|10月|神無月|10월)/iu, month: 10 },
  { pattern: /(?:十一月|11月|霜月|11월)/iu, month: 11 },
  { pattern: /(?:十二月|12月|師走|12월)/iu, month: 12 },
];

// ─── Sexagenary cycle (干支) ─────────────────────────────────────────

/**
 * Chinese sexagenary cycle (干支) — 60-year repeating calendar.
 * Each entry maps a stem-branch pair to its cyclic position (0-59).
 * The cycle starts at 甲子 (index 0).
 */
export const SEXAGENARY_CYCLE: string[] = [
  '甲子',
  '乙丑',
  '丙寅',
  '丁卯',
  '戊辰',
  '己巳',
  '庚午',
  '辛未',
  '壬申',
  '癸酉',
  '甲戌',
  '乙亥',
  '丙子',
  '丁丑',
  '戊寅',
  '己卯',
  '庚辰',
  '辛巳',
  '壬午',
  '癸未',
  '甲申',
  '乙酉',
  '丙戌',
  '丁亥',
  '戊子',
  '己丑',
  '庚寅',
  '辛卯',
  '壬辰',
  '癸巳',
  '甲午',
  '乙未',
  '丙申',
  '丁酉',
  '戊戌',
  '己亥',
  '庚子',
  '辛丑',
  '壬寅',
  '癸卯',
  '甲辰',
  '乙巳',
  '丙午',
  '丁未',
  '戊申',
  '己酉',
  '庚戌',
  '辛亥',
  '壬子',
  '癸丑',
  '甲寅',
  '乙卯',
  '丙辰',
  '丁巳',
  '戊午',
  '己未',
  '庚申',
  '辛酉',
  '壬戌',
  '癸亥',
];

/** Heavenly stems (天干) */
export const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** Earthly branches (地支) */
export const EARTHLY_BRANCHES = [
  '子',
  '丑',
  '寅',
  '卯',
  '辰',
  '巳',
  '午',
  '未',
  '申',
  '酉',
  '戌',
  '亥',
];

/** Zodiac animals associated with earthly branches */
export const ZODIAC: Record<string, string> = {
  子: '鼠',
  丑: '牛',
  寅: '虎',
  卯: '兔',
  辰: '龙',
  巳: '蛇',
  午: '马',
  未: '羊',
  申: '猴',
  酉: '鸡',
  戌: '狗',
  亥: '猪',
};

// ─── Japanese era names ──────────────────────────────────────────────

/**
 * Japanese era names (年号) and their Gregorian start years.
 * Format: { name: [regex_pattern, startYear, startMonth, startDay] }
 */
export interface EraEntry {
  name: string;
  pattern: RegExp;
  startYear: number;
  startMonth: number;
  startDay: number;
}

export const JAPANESE_ERAS: EraEntry[] = [
  { name: '令和', pattern: /(?:令和|れいわ|Reiwa)/iu, startYear: 2019, startMonth: 5, startDay: 1 },
  {
    name: '平成',
    pattern: /(?:平成|へいせい|Heisei)/iu,
    startYear: 1989,
    startMonth: 1,
    startDay: 8,
  },
  {
    name: '昭和',
    pattern: /(?:昭和|しょうわ|Showa)/iu,
    startYear: 1926,
    startMonth: 12,
    startDay: 25,
  },
  {
    name: '大正',
    pattern: /(?:大正|たいしょう|Taisho)/iu,
    startYear: 1912,
    startMonth: 7,
    startDay: 30,
  },
  {
    name: '明治',
    pattern: /(?:明治|めいじ|Meiji)/iu,
    startYear: 1868,
    startMonth: 10,
    startDay: 23,
  },
];

// ─── Korean era/calendar ─────────────────────────────────────────────

/** Korean Dangi (단기) era — offsets from Gregorian by 2333 years */
export const KOREAN_DANGI_OFFSET = 2333;

/** Korean era pattern */
export const KOREAN_DANGI_PATTERN = /(?:단기|檀紀|Dangi)/iu;

// ─── Lunar calendar markers ──────────────────────────────────────────

export const LUNAR_CALENDAR_MARKER = /(?:农历|陰曆|旧暦|旧历|음력|lunar\s*calendar)/iu;

/** Lunar month names */
export const LUNAR_MONTHS: Record<string, number> = {
  正月: 1,
  一月: 1,
  端月: 1,
  二月: 2,
  杏月: 2,
  三月: 3,
  桃月: 3,
  四月: 4,
  槐月: 4,
  五月: 5,
  榴月: 5,
  蒲月: 5,
  六月: 6,
  荷月: 6,
  七月: 7,
  巧月: 7,
  兰月: 7,
  八月: 8,
  桂月: 8,
  九月: 9,
  菊月: 9,
  十月: 10,
  阳月: 10,
  十一月: 11,
  冬月: 11,
  葭月: 11,
  十二月: 12,
  腊月: 12,
  冰月: 12,
};

/** Lunar day names */
export const LUNAR_DAYS: Record<string, number> = {
  初一: 1,
  初二: 2,
  初三: 3,
  初四: 4,
  初五: 5,
  初六: 6,
  初七: 7,
  初八: 8,
  初九: 9,
  初十: 10,
  十一: 11,
  十二: 12,
  十三: 13,
  十四: 14,
  十五: 15,
  十六: 16,
  十七: 17,
  十八: 18,
  十九: 19,
  二十: 20,
  廿一: 21,
  廿二: 22,
  廿三: 23,
  廿四: 24,
  廿五: 25,
  廿六: 26,
  廿七: 27,
  廿八: 28,
  廿九: 29,
  三十: 30,
};

// ─── Relative quantifiers ────────────────────────────────────────────

/** "Next" — 下/来/다음 (next week/month/year) */
export const NEXT_PATTERN = /(?:next|下[个個]?|来|來|다음|내[년달주일])/iu;

/** "Last/previous" — 上/前/去/지난 (last week/month/year) */
export const LAST_PATTERN = /(?:last|previous|上[个個]?|前[个個]?|去|지난|전[년달주])/iu;

/** "This" — 这/本/今/이번/금 (this week/month/year) */
export const THIS_PATTERN =
  /(?:this|这[个個]?|這[个個]?|本[周週年月]|今[周週年月]|이번|금[년월주])/iu;

/** "N units ago" — N天前/N日前/N日前/N일 전 */
export const AGO_PATTERN =
  /(\d+|[一二三四五六七八九十百千万]+)\s*(?:天|日|周|週|个?月|年|시간|일|주|개월|년)\s*(?:前|ago|전|まえ)/iu;

/** "N units after/later" — N天后/N日后/N日後/N일 후 */
export const AFTER_PATTERN =
  /(\d+|[一二三四五六七八九十百千万]+)\s*(?:天|日|周|週|个?月|年|시간|일|주|개월|년)\s*(?:后|後|後|after|later|후|あと)/iu;

/** Chinese numeral mapping (digit characters → numeric value) */
export const CHINESE_NUMERALS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  百: 100,
  千: 1000,
  万: 10000,
  萬: 10000,
  亿: 100000000,
  億: 100000000,
};

// ─── Time-of-day markers ─────────────────────────────────────────────

export interface TimeOfDayEntry {
  pattern: RegExp;
  /** Typical hour range [start, end) — 24h format */
  hourRange: [number, number];
  /** Default hour if no specific time given */
  defaultHour: number;
}

export const TIME_OF_DAY_MARKERS: TimeOfDayEntry[] = [
  {
    pattern: /(?:凌晨|早[晨上]?|清晨|morning|朝|あさ|오전\s*일찍)/iu,
    hourRange: [0, 12],
    defaultHour: 8,
  },
  { pattern: /(?:上午|午前|오전|ごぜん)/iu, hourRange: [0, 12], defaultHour: 9 },
  { pattern: /(?:中午|正午|noon|正午|낮|ひる)/iu, hourRange: [11, 13], defaultHour: 12 },
  { pattern: /(?:下午|午后|午後|오후|ごご)/iu, hourRange: [12, 18], defaultHour: 14 },
  { pattern: /(?:傍晚|黄昏|evening|夕方|ゆうがた|저녁)/iu, hourRange: [17, 20], defaultHour: 18 },
  { pattern: /(?:晚上|夜[里晚]?|night|夜|よる|밤)/iu, hourRange: [18, 24], defaultHour: 20 },
];

// ─── Temporal units ──────────────────────────────────────────────────

export type TemporalUnit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';

export const UNIT_PATTERNS: Record<TemporalUnit, RegExp> = {
  year: /(?:年|year|년|ねん)/iu,
  month: /(?:(?:个|個|ヶ|个)?月|month|개월|달|ヶ月|かげつ)/iu,
  week: /(?:(?:个|個)?(?:星期|周|週|礼拜|禮拜)|week|주|주일|しゅう)/iu,
  day: /(?:[天日]|day|일|にち)/iu,
  hour: /(?:(?:个|個)?(?:小时|小時|时|時|钟头|鐘頭|点|點)|hour|시간|じかん)/iu,
  minute: /(?:(?:分[钟鐘]?)|minute|분|ふん)/iu,
  second: /(?:秒|second|초|びょう)/iu,
};

// ─── Time expression regex ───────────────────────────────────────────

/** CJK time: "3点", "3時", "3시", "下午3点30分", "午後3時半" */
export const CJK_TIME_PATTERN =
  /((?:凌晨|早[晨上]?|清晨|morning|朝|あさ|上午|午前|오전|ごぜん|中午|正午|noon|正午|낮|ひる|下午|午后|午後|오후|ごご|傍晚|黄昏|evening|夕方|ゆうがた|저녁|晚上|夜[里晚]?|night|夜|よる|밤)\s*)?(\d{1,2}|[一二两兩三四五六七八九十])\s*(?:[点點時:：])\s*(?:(\d{1,2}|[一二两兩三四五六七八九十三])\s*(?:[分])\s*)?(?:(\d{1,2}|[一二两兩三四五六七八九十三])\s*(?:秒)\s*)?(半|quarter|刻)?/iu;

/** CJK date: "2024年1月15日", "令和6年1月15日" */
export const CJK_DATE_PATTERN =
  /((?:令和|平成|昭和|大正|明治|れいわ|へいせい|しょうわ|たいしょう|めいじ|Reiwa|Heisei|Showa|Taisho|Meiji|단기|檀紀|Dangi)\s*)?(\d{1,4}|[一二两兩三四五六七八九十百千万萬]+)\s*年\s*(\d{1,2}|[一二两兩三四五六七八九十]+)\s*月\s*(\d{1,2}|[一二两兩三四五六七八九十廿卄]+)\s*日/iu;

/** Lunar CJK date: "农历正月初一", "旧暦睦月一日" */
export const LUNAR_DATE_PATTERN =
  /(?:农历|陰曆|旧暦|旧历|음력|lunar\s*calendar)\s*([正一二三四五六七八九十冬腊端杏桃槐榴蒲荷巧兰桂菊阳葭冰]\s*月|[一二三四五六七八九十]月|睦月|如月|弥生|卯月|皐月|水無月|文月|葉月|長月|神無月|霜月|師走)\s*([初一二三四五六七八九十廿卄十]+\s*[日]?)/iu;
