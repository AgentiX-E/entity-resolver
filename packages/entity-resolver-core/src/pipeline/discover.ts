/**
 * U-Pipe Stage 0: Discover — LLM-driven auto-SOP generation
 *
 * Automatically analyzes any dataset and generates a MatchingSOP
 * without manual configuration. Uses LLM for semantic field understanding
 * and pattern-based heuristics for statistical field properties.
 *
 * Input: raw records (first 100 rows for schema analysis)
 * Output: DiscoveredSchema with MatchingSOP
 */
import type { MatchingSOP, DiscoveredSchema } from '../pipeline/unified.js';

/** Configuration for auto-discovery. */
export interface DiscoverConfig {
  readonly apiKey: string;
  readonly provider?: string;
  readonly model?: string;
  readonly sampleSize?: number;
}

/**
 * Auto-discover schema and generate MatchingSOP from raw records.
 * Combines LLM semantic analysis with statistical profiling.
 */
export async function autoDiscover(
  records: readonly Record<string, unknown>[],
  config: DiscoverConfig,
): Promise<DiscoveredSchema> {
  const sample = records.slice(0, config.sampleSize ?? 100);
  const fields = Object.keys(sample[0] ?? {});
  const fieldProfiles = buildFieldProfiles(sample, fields);

  // LLM-powered semantic classification
  let llmClassification: Record<string, string> = {};
  if (config.apiKey) {
    try {
      llmClassification = await classifyFieldsWithLLM(fields, fieldProfiles, sample, config);
    } catch {
      // Graceful fallback to statistical profiling
    }
  }

  // Merge LLM + statistical results
  const types: Record<string, string> = {};
  for (const f of fields) {
    types[f] = llmClassification[f] ?? classifyFieldStatistically(f, fieldProfiles[f]!);
  }

  // Generate SOP from classified schema
  const sop = generateSOP(fields, types, fieldProfiles);

  return { fields, types, sop };
}

/** Statistical field profile. */
interface FieldProfile {
  nullRatio: number;
  cardinality: number;
  avgLength: number;
  numericRatio: number;
  samples: string[];
}

function buildFieldProfiles(
  records: readonly Record<string, unknown>[],
  fields: readonly string[],
): Record<string, FieldProfile> {
  const result: Record<string, FieldProfile> = {};
  for (const f of fields) {
    const values = records.map((r) => String(r[f] ?? '').trim());
    const nonEmpty = values.filter((v) => v.length > 0);
    result[f] = {
      nullRatio: (values.length - nonEmpty.length) / values.length,
      cardinality: new Set(nonEmpty).size,
      avgLength: nonEmpty.reduce((s, v) => s + v.length, 0) / Math.max(nonEmpty.length, 1),
      numericRatio: nonEmpty.filter((v) => /^\d+(\.\d+)?$/.test(v)).length / Math.max(nonEmpty.length, 1),
      samples: nonEmpty.slice(0, 5),
    };
  }
  return result;
}

/** Statistical field classification (fallback). */
function classifyFieldStatistically(
  name: string,
  profile: FieldProfile,
): string {
  const n = name.toLowerCase();
  if (/\b(email|e.?mail)\b/.test(n) || profile.samples.some((s) => s.includes('@'))) return 'email';
  if (/\b(phone|tel|mobile|fax)\b/.test(n)) return 'phone';
  if (/\b(price|cost|amount|revenue|salary)\b/.test(n)) return 'price';
  if (/\b(date|time|created|updated|birth)\b/.test(n)) return 'date';
  if (/\b(id|key|uuid|guid)\b/.test(n)) return 'identifier';
  if (/\b(name|title|product|item|description|desc)\b/.test(n)) return 'name';
  if (/\b(address|street|city|state|zip|country|location)\b/.test(n)) return 'address';
  if (profile.numericRatio > 0.8) return 'numeric';
  if (profile.cardinality / profile.samples.length > 0.95) return 'identifier';
  return 'text';
}

/** LLM-powered field classification. */
async function classifyFieldsWithLLM(
  fields: readonly string[],
  profiles: Record<string, FieldProfile>,
  _sample: readonly Record<string, unknown>[],
  config: DiscoverConfig,
): Promise<Record<string, string>> {
  // Build context for the LLM
  let prompt = 'Classify each field in this dataset. Choose from: email, phone, price, date, identifier, name, address, numeric, text.\n\n';
  prompt += 'Fields with sample values:\n';
  for (const f of fields) {
    prompt += `  ${f}: ${profiles[f]!.samples.slice(0, 3).join(' | ')}\n`;
  }
  prompt += '\nOutput ONLY a JSON object mapping field name to type. Example: {"name":"name","price":"price"}';

  const body = JSON.stringify({
    model: config.model ?? 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0,
  });

  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('curl', ['-s', '-m', '30',
    'https://api.deepseek.com/chat/completions',
    '-H', 'Content-Type: application/json',
    '-H', 'Authorization: Bearer ' + config.apiKey,
    '-d', body,
  ], { encoding: 'utf-8', timeout: 30000 });

  try {
    const j = JSON.parse(result.stdout);
    const content = j.choices?.[0]?.message?.content ?? '';
    // Extract JSON from LLM response
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch {
    return {};
  }
}

/** Generate a MatchingSOP from classified schema. */
function generateSOP(
  fields: readonly string[],
  types: Record<string, string>,
  profiles: Record<string, FieldProfile>,
): MatchingSOP {
  const identityFields = fields.filter((f) => types[f] === 'email' || types[f] === 'identifier');
  const nameFields = fields.filter((f) => types[f] === 'name' || types[f] === 'text' || types[f] === 'address');
  const numericFields = fields.filter((f) => types[f] === 'price' || types[f] === 'numeric' || types[f] === 'date');

  const tolerances: Record<string, string[]> = {};
  for (const f of fields) {
    const t: string[] = [];
    if (types[f] === 'name' || types[f] === 'text') t.push('abbreviation', 'typo', 'reorder');
    if (profiles[f]!.avgLength > 20) t.push('truncation');
    tolerances[f] = t;
  }

  // Estimate density from cardinality
  const totalRecords = profiles[fields[0]!]?.samples.length ?? 100;
  let avgCard = 0;
  for (const f of fields) avgCard += profiles[f]!.cardinality / totalRecords;
  const estDensity = Math.max(0.001, Math.min(0.5, 1 - avgCard / fields.length));

  return {
    version: '1.0',
    domain: identityFields.length > 0 ? 'person_matching' : (nameFields.length > 2 ? 'product_matching' : 'general'),
    fieldHierarchy: {
      critical: identityFields.slice(0, 3),
      high: nameFields.slice(0, 2),
      medium: numericFields.slice(0, 2),
      low: fields.filter((f) => !identityFields.includes(f) && !nameFields.includes(f) && !numericFields.includes(f)),
    },
    tolerances,
    decisionRules: {
      match: '>=1 critical agree OR >=2 high agree with 0 critical conflict',
      review: '1 high agree + moderate + 0 conflict',
      nonMatch: '>=1 critical conflict',
    },
    estimatedDensity: estDensity,
  };
}
