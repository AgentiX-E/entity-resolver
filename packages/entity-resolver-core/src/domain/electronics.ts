/**
 * Domain Extraction — Parse product names into structured fields.
 *
 * GoldenMatch-equivalent: extracts brand, product_type, model,
 * specs, size, and color from unstructured product titles.
 * Uses regex patterns + LLM fallback for ambiguous cases.
 *
 * I45: SOTA product matching strategy
 */

/** Extracted fields from a product name. */
export interface ProductFields {
  readonly brand: string;
  readonly productType: string;
  readonly model: string;
  readonly specs: string;
  readonly size: string;
  readonly color: string;
  /** Remaining text after extraction. */
  readonly remaining: string;
}

// ═══════════════════════ Electronics Rulebook ══════════════════

/** Known electronics brands. */
const BRANDS = new Set([
  'apple', 'samsung', 'sony', 'lg', 'dell', 'hp', 'lenovo', 'asus', 'acer',
  'microsoft', 'google', 'amazon', 'bose', 'sennheiser', 'jbl', 'logitech',
  'canon', 'nikon', 'gopro', 'fujifilm', 'panasonic', 'toshiba', 'philips',
  'xiaomi', 'huawei', 'oneplus', 'motorola', 'nokia', 'blackberry',
  'sandisk', 'western digital', 'seagate', 'kingston', 'crucial', 'corsair',
  'intel', 'amd', 'nvidia', 'radeon', 'geforce',
  'belkin', 'anker', 'ravpower', 'aukey',
  'fitbit', 'garmin', 'polar',
  'bose', 'beats', 'skullcandy', 'jaybird',
  'dyson', 'irobot', 'roomba', 'nest',
  'ring', 'arlo', 'wyze', 'eufy',
  'tcl', 'hisense', 'vizio', 'sharp', 'insignia',
  'linksys', 'netgear', 'tp-link', 'd-link', 'asus',
  'razer', 'steelseries', 'hyperx',
  'apple', 'ibm', 'compaq', 'gateway', 'packard',
  'creative', 'yamaha', 'denon', 'onkyo', 'pioneer', 'marantz',
  'eureka', 'hoover', 'bissell', 'shark',
  'bush', 'grundig', 'hitachi', 'jvc', 'mitsubishi', 'sanyo',
  'brother', 'epson', 'lexmark', 'oki', 'xerox',
  'bT', 'sky', 'virgin', 'talktalk', 'vodafone',
]);

/** Known color words. */
const COLORS = new Set([
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'gray', 'grey', 'silver', 'gold', 'rose gold',
  'space gray', 'space grey', 'midnight', 'starlight', 'graphite',
  'sierra blue', 'alpine green', 'pacific blue', 'deep purple',
  'titanium', 'natural titanium', 'blue titanium', 'white titanium',
  'black titanium', 'navy', 'teal', 'coral', 'mint', 'lavender',
  'champagne', 'bronze', 'copper', 'charcoal', 'slate', 'ivory',
  'cream', 'beige', 'burgundy', 'maroon', 'crimson', 'scarlet',
  'forest green', 'olive', 'sand', 'taupe', 'blush',
  'ceramic white', 'phantom black', 'aura glow',
]);

/** Size/spec pattern: digits + unit. */
const SIZE_PATTERN = /(\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|inches|"|'|GB|TB|MB|MHz|GHz|W|V|A|mAh|Wh))/gi;

/** Model pattern: letter-number combinations like "A2172", "MK2E3LL/A". */
const MODEL_PATTERN = /\b([A-Z]{1,2}\d{2,5}[A-Z]*(\/[A-Z]+)?)\b/g;

/** Spec patterns. */
const SPEC_PATTERN = /\b(\d+\s*(?:GB|TB|MB|MHz|GHz|W|V|A|mAh|Wh|MP|inch|'|")\b|\d{1,2}(?:th|st|nd|rd)\s*gen|\d+[\.,]?\d*\s*(?:x|×)\s*\d+[\.,]?\d*)\b/gi;

/**
 * Extract structured fields from an electronics product name.
 */
export function extractElectronicsFields(name: string): ProductFields {
  const text = name.trim();
  const lower = text.toLowerCase();

  // Find brand
  let brand = '';
  for (const b of BRANDS) {
    if (lower.includes(b) && b.length > brand.length) {
      brand = b;
    }
  }

  // Find color
  let color = '';
  for (const c of COLORS) {
    if (lower.includes(c) && c.length > color.length) {
      color = c;
    }
  }

  // Find size (detect diagonal screen sizes and storage)
  const sizeMatches = text.match(SIZE_PATTERN) ?? [];
  const size = [...new Set(sizeMatches.map((s: string) => s.trim()))].join(' ');

  // Find model number
  const modelMatches = text.match(MODEL_PATTERN) ?? [];
  const model = [...new Set(modelMatches.map((s: string) => s.trim()))].join(' ');

  // Find specs
  const specMatches = text.match(SPEC_PATTERN) ?? [];
  const specs = [...new Set(specMatches.map((s: string) => s.trim()))].join(' ');
  const cleanSpecs = specs.replace(new RegExp(size.replace(/\s+/g, '|'), 'gi'), '').trim();

  // Determine product type (words between brand and model/spec)
  let productType = '';
  if (brand) {
    const afterBrand = lower.substring(lower.indexOf(brand) + brand.length);
    const typeWords = afterBrand.split(/[\s\-]+/).filter((w: string) =>
      w.length > 1 && !/^\d/.test(w) && !COLORS.has(w) && !/^(gb|tb|mb|inch|mm|cm)$/i.test(w)
    ).slice(0, 3);
    productType = typeWords.join(' ');
  }

  // Remaining text
  let remaining = lower;
  if (brand) remaining = remaining.replace(brand, '').trim();
  if (color) remaining = remaining.replace(color, '').trim();
  if (size) remaining = remaining.replace(size, '').trim();
  remaining = remaining.replace(/[-\s]+/g, ' ').trim();

  return {
    brand: brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : '',
    productType: productType || text.split(/[\s\-]+/)[0] || '',
    model: model,
    specs: cleanSpecs,
    size: size.replace(cleanSpecs, '').trim(),
    color: color ? color.charAt(0).toUpperCase() + color.slice(1) : '',
    remaining,
  };
}
