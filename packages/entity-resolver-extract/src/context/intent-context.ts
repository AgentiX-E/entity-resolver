/**
 * Intent-enhanced extraction context.
 *
 * Maps user intent names to field boosting configurations.
 * Each intent specifies which fields are relevant, providing:
 *   - Priority ordering for field matching
 *   - Confidence boost for intent-matched fields
 *   - Default values for fields not found in text
 *   - Field type hints and synonyms
 *
 * Example:
 *   Intent "alarm" — boosts time, date, title fields.
 *   "明天下午3点" → { time: "15:00", date: "2024-06-16", title: "Alarm" }
 *
 * Architecture:
 *   Intent definitions are extensible. Users can register custom intents
 *   at runtime via registerIntent(). Built-in intents cover common
 *   scenarios: alarm, reminder, schedule, message, search.
 */

import type { FieldDescriptor } from '../extractor.js';

/**
 * A single intent definition.
 */
export interface IntentDefinition {
  /** Intent name (e.g. "alarm", "reminder", "schedule") */
  name: string;
  /** Fields relevant to this intent, in priority order */
  fields: IntentField[];
  /** Synonyms for this intent (used for fuzzy matching) */
  synonyms?: string[];
  /** Default field values when not found in text */
  defaults?: Record<string, unknown>;
}

export interface IntentField {
  /** Field name (matches schema field name) */
  name: string;
  /** Expected type hint */
  type: string;
  /** Confidence boost [0, 1] applied to pattern matches */
  boost: number;
  /** Is this field required for the intent to be valid? */
  required?: boolean;
  /** Synonyms for field name (e.g. "time" ↔ "when", "at") */
  synonyms?: string[];
  /** Field description for LLM-enabled extraction (I16) */
  description?: string;
}

/**
 * Result of applying intent context to extraction.
 */
export interface IntentContextResult {
  /** Intent name that was matched */
  intentName: string;
  /** Fields sorted by intent priority */
  prioritizedFields: FieldDescriptor[];
  /** Confidence boost per field name */
  boosts: Record<string, number>;
  /** Default values per field name */
  defaults: Record<string, unknown>;
  /** Required fields that must be present */
  requiredFields: string[];
}

// ─── Built-in intent definitions ─────────────────────────────────────

const BUILTIN_INTENTS: IntentDefinition[] = [
  {
    name: 'alarm',
    synonyms: ['alarm', '闹钟', '目覚まし', '알람', 'wake', 'remind me'],
    fields: [
      { name: 'time', type: 'time', boost: 0.12, required: true, synonyms: ['at', '在', 'に'], description: 'Alarm time in HH:MM format' },
      { name: 'date', type: 'date', boost: 0.08, synonyms: ['on', '日期'], description: 'Alarm date' },
      { name: 'title', type: 'string', boost: 0.05, synonyms: ['for', '标题', '名前'], description: 'Alarm label/title' },
      { name: 'repeat', type: 'string', boost: 0.03, synonyms: ['repeat', '重复', 'every'], description: 'Repeat schedule' },
    ],
    defaults: { title: 'Alarm' },
  },
  {
    name: 'reminder',
    synonyms: ['reminder', '提醒', 'リマインダー', '리마인더', 'remind'],
    fields: [
      { name: 'time', type: 'time', boost: 0.12, required: true, synonyms: ['at', '在'], description: 'Reminder time' },
      { name: 'date', type: 'date', boost: 0.08, synonyms: ['on'], description: 'Reminder date' },
      { name: 'title', type: 'string', boost: 0.10, required: true, synonyms: ['to', 'about', '内容'], description: 'What to be reminded about' },
      { name: 'location', type: 'string', boost: 0.03, synonyms: ['at', 'in', '在'], description: 'Reminder location' },
    ],
    defaults: { title: 'Reminder' },
  },
  {
    name: 'schedule',
    synonyms: ['schedule', '日程', 'スケジュール', '일정', 'meeting', 'appointment', '会议', '预约'],
    fields: [
      { name: 'date', type: 'date', boost: 0.12, required: true, synonyms: ['on', '日期'], description: 'Schedule date' },
      { name: 'time', type: 'time', boost: 0.12, required: true, synonyms: ['at', '时间'], description: 'Schedule time' },
      { name: 'title', type: 'string', boost: 0.10, required: true, synonyms: ['for', 'about', '主题'], description: 'Event title' },
      { name: 'location', type: 'string', boost: 0.08, synonyms: ['at', 'in', '地点', '在'], description: 'Event location' },
      { name: 'duration', type: 'number', boost: 0.03, synonyms: ['for', '时长'], description: 'Duration in minutes' },
      { name: 'attendees', type: 'string', boost: 0.02, synonyms: ['with', 'participants'], description: 'Meeting attendees' },
    ],
    defaults: { title: 'Meeting' },
  },
  {
    name: 'message',
    synonyms: ['message', '消息', 'メッセージ', '메시지', 'send', 'text', '发送'],
    fields: [
      { name: 'recipient', type: 'string', boost: 0.10, required: true, synonyms: ['to', 'send to', '发给'], description: 'Message recipient' },
      { name: 'content', type: 'string', boost: 0.10, required: true, synonyms: ['content', 'body', '内容'], description: 'Message content' },
      { name: 'time', type: 'time', boost: 0.05, synonyms: ['at'], description: 'Send time' },
    ],
    defaults: {},
  },
  {
    name: 'search',
    synonyms: ['search', '搜索', '検索', '검색', 'find', 'lookup', '查找'],
    fields: [
      { name: 'query', type: 'string', boost: 0.15, required: true, synonyms: ['for', '内容', '关键词'], description: 'Search query' },
      { name: 'source', type: 'string', boost: 0.05, synonyms: ['in', 'from', '来源'], description: 'Search source/platform' },
      { name: 'limit', type: 'number', boost: 0.02, synonyms: ['top', 'count', '数量'], description: 'Result count limit' },
    ],
    defaults: { limit: 10 },
  },
];

// ─── Intent Registry ─────────────────────────────────────────────────

let intentRegistry: Map<string, IntentDefinition> | null = null;

function getIntentRegistry(): Map<string, IntentDefinition> {
  if (!intentRegistry) {
    intentRegistry = new Map();
    for (const intent of BUILTIN_INTENTS) {
      intentRegistry.set(intent.name, intent);
      for (const syn of intent.synonyms ?? []) {
        intentRegistry.set(syn, intent);
      }
    }
  }
  return intentRegistry;
}

/**
 * Register a custom intent definition.
 * Overwrites existing intent with the same name.
 */
export function registerIntent(intent: IntentDefinition): void {
  const registry = getIntentRegistry();
  registry.set(intent.name, intent);
  for (const syn of intent.synonyms ?? []) {
    registry.set(syn, intent);
  }
}

/**
 * Look up an intent by name or synonym.
 * Returns undefined if no intent matches.
 */
export function lookupIntent(name: string): IntentDefinition | undefined {
  const registry = getIntentRegistry();
  return registry.get(name) ?? registry.get(name.toLowerCase());
}

/**
 * Resolve an intent from text or explicit name.
 * Returns the best-matching intent or undefined.
 */
export function resolveIntent(
  intentHint?: string,
  text?: string,
): IntentContextResult | undefined {
  // Try explicit intent name first
  if (intentHint) {
    const def = lookupIntent(intentHint);
    if (def) return buildContextResult(def);
  }

  // Try to detect intent from text keywords
  if (text) {
    const lower = text.toLowerCase();
    const registry = getIntentRegistry();
    for (const [, def] of registry) {
      for (const syn of def.synonyms ?? []) {
        if (lower.includes(syn.toLowerCase())) {
          return buildContextResult(def);
        }
      }
    }
  }

  return undefined;
}

/**
 * Build IntentContextResult from an IntentDefinition.
 */
function buildContextResult(def: IntentDefinition): IntentContextResult {
  const prioritizedFields: FieldDescriptor[] = [];
  const boosts: Record<string, number> = {};
  const defaults: Record<string, unknown> = {};
  const requiredFields: string[] = [];

  for (const f of def.fields) {
    prioritizedFields.push({
      name: f.name,
      type: f.type,
      description: f.description ?? f.name,
      ...(f.required ? { required: f.required } : {}),
    });
    boosts[f.name] = f.boost;
    if (f.required) requiredFields.push(f.name);
  }

  for (const [key, value] of Object.entries(def.defaults ?? {})) {
    defaults[key] = value;
  }

  return {
    intentName: def.name,
    prioritizedFields,
    boosts,
    defaults,
    requiredFields,
  };
}

/**
 * Apply intent context to extraction results.
 * Boosts confidence scores for intent-relevant fields.
 */
export function applyIntentContext(
  confidence: Record<string, number>,
  context: IntentContextResult,
): Record<string, number> {
  const boosted = { ...confidence };
  for (const [field, boost] of Object.entries(context.boosts)) {
    if (field in boosted && boosted[field]! > 0) {
      boosted[field] = Math.min((boosted[field] ?? 0) + boost, 1.0);
    }
  }
  return boosted;
}

/**
 * Merge default values into extraction results.
 * Only fills fields that were not extracted from the text.
 */
export function applyDefaults(
  values: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...values };
  for (const [key, value] of Object.entries(defaults)) {
    if (merged[key] === undefined || merged[key] === null) {
      merged[key] = value;
    }
  }
  return merged;
}
