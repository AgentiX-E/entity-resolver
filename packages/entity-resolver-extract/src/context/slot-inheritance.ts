/**
 * Slot inheritance for multi-turn dialog entity extraction.
 *
 * In multi-turn conversations, the user may provide information across
 * multiple utterances. SlotInheritance tracks previously extracted slots
 * and carries them forward when the user doesn't explicitly change them.
 *
 * Key operations:
 *   - inherit(): Combine previous slots with new extraction results
 *   - detectConflict(): Check if the user is explicitly changing a slot
 *   - detectCancellation(): Check if the user is canceling the action
 *
 * Example multi-turn flow:
 *   Turn 1: "明天下午3点设闹钟"
 *     → { time: "15:00", date: "2024-06-16", title: "闹钟" }
 *   Turn 2: "改成5点"
 *     → inherit previous + update time → { time: "17:00", date: "2024-06-16", title: "闹钟" }
 *   Turn 3: "再加一个提醒"
 *     → merge with inherited → { ...previous, action: "add_another" }
 *
 * Conflict detection:
 *   When the user says "改成X" or "不是Y，是Z", the slot manager detects
 *   that X is being explicitly overridden and replaces it.
 */

/**
 * Previous turn's extraction context.
 */
export interface ExtractionContext {
  /** Extracted values from the previous turn */
  values: Record<string, unknown>;
  /** Confidence scores from the previous turn */
  confidence: Record<string, number>;
  /** Provenance per field */
  provenance: Record<string, 'pattern' | 'onnx' | 'llm'>;
  /** The intent from the previous turn (optional) */
  intentName?: string | undefined;
  /** Normalized text from previous turn (optional) */
  normalizedText?: string | undefined;
}

// ─── Change detection patterns ───────────────────────────────────────

/** Patterns that indicate the user is explicitly modifying a previous slot */
const CHANGE_PATTERNS: RegExp[] = [
  /(?:改[成为到]?|换成?|改成?|换成?|换成?|修改[成为]?|更新[成为]?|换成?|变更?)/iu,            // Chinese: 改/改成/换成/修改/更新
  /(?:change|update|modify|set|switch|replace)\s+(?:to|with|as)?/iu,                 // English
  /(?:変[更え]|変更|修正)/iu,                                                          // Japanese
  /(?:변경|수정|바꾸)/iu,                                                                // Korean
];

/** Patterns that indicate the user is canceling */
const CANCEL_PATTERNS: RegExp[] = [
  /(?:取消|算了|不要了|撤回|撤销|停止|cancel|forget|中止|取り消し|취소)/iu,
];

/** "Not X, but Y" correction patterns */
const CORRECTION_PATTERN =
  /(?:不是|不对|错了?|不是这样的?|no\b|wrong|違う|아니)/iu;

/**
 * Detect if text contains slot modification intent.
 * Returns the field name being modified, or undefined.
 */
export function detectModification(
  text: string,
  previousContext?: ExtractionContext,
): { isModification: boolean; changedField?: string } {
  if (!previousContext) return { isModification: false };

  const hasChangeKeyword = CHANGE_PATTERNS.some((p) => p.test(text));
  if (!hasChangeKeyword) return { isModification: false };

  // Try to detect which field is being changed by comparing
  // the new text's matched fields with previous values
  const knownFields = Object.keys(previousContext.values).filter(
    (k) => previousContext.values[k] !== undefined,
  );

  for (const field of knownFields) {
    // Check if the text contains field-specific synonyms
    const fieldSynonyms: Record<string, string[]> = {
      time: ['点', '時', '시', '时间', '時間'],
      date: ['号', '日', '날짜', '日期'],
      title: ['叫', '标题', '標題', '제목', '名字', '名称'],
      location: ['在', '地点', '場所', '장소', '位置'],
    };
    const synonyms = fieldSynonyms[field] ?? [];
    for (const syn of synonyms) {
      if (text.includes(syn)) {
        return { isModification: true, changedField: field };
      }
    }
  }

  return { isModification: true };
}

/**
 * Detect if the text indicates cancellation.
 */
export function detectCancellation(text: string): boolean {
  return CANCEL_PATTERNS.some((p) => p.test(text));
}

/**
 * Detect if the text contains a self-correction ("not X, Y").
 */
export function detectCorrection(text: string): boolean {
  return CORRECTION_PATTERN.test(text);
}

// ─── Slot inheritance ────────────────────────────────────────────────

export interface InheritResult {
  /** Merged values (previous + new, with conflicts resolved) */
  values: Record<string, unknown>;
  /** Which fields came from inheritance (not new extraction) */
  inheritedFields: string[];
  /** Which fields were modified by this turn */
  modifiedFields: string[];
  /** Whether the user canceled the action */
  canceled: boolean;
}

/**
 * Inherit slots from a previous extraction context.
 *
 * Rules:
 *   1. New extractions always override inherited values
 *   2. If text contains a change keyword, only the changed field gets the new value;
 *      other new extractions are ignored (they might be noise from the change text)
 *   3. If text indicates cancellation, all values are cleared
 *   4. Inherited confidence decays by 10% per turn (reliability discount)
 *
 * @param newValues - Freshly extracted values from current text
 * @param newConfidence - Confidence scores from current extraction
 * @param previous - Previous turn's extraction context
 * @param text - Raw text of the current utterance (for change detection)
 */
export function inheritSlots(
  newValues: Record<string, unknown>,
  newConfidence: Record<string, number>,
  previous: ExtractionContext,
  text: string,
): InheritResult {
  const inheritedFields: string[] = [];
  const modifiedFields: string[] = [];

  // Check cancellation
  if (detectCancellation(text)) {
    return {
      values: { _canceled: true },
      inheritedFields: [],
      modifiedFields: [],
      canceled: true,
    };
  }

  // Check modification
  const modification = detectModification(text, previous);
  const isModifying = modification.isModification;

  // Start with inherited values
  const values: Record<string, unknown> = {};

  for (const [key, prevValue] of Object.entries(previous.values)) {
    if (key.startsWith('_')) continue; // Skip internal fields

    const hasNewValue = key in newValues && newValues[key] !== undefined;

    if (isModifying && key === modification.changedField && hasNewValue) {
      // Explicit change — use new value
      values[key] = newValues[key];
      modifiedFields.push(key);
    } else if (isModifying && hasNewValue) {
      // During modification, ignore new values for non-target fields
      values[key] = prevValue;
    } else if (hasNewValue) {
      // New extraction overrides inherited (only if confidence is higher or equal)
      const newConf = newConfidence[key] ?? 0;
      const prevConf = previous.confidence[key] ?? 0;
      if (newConf >= prevConf * 0.8) {
        values[key] = newValues[key];
        modifiedFields.push(key);
      } else {
        values[key] = prevValue;
        inheritedFields.push(key);
      }
    } else {
      // No new value — inherit
      values[key] = prevValue;
      inheritedFields.push(key);
    }
  }

  // Add new fields that weren't in previous context
  for (const [key, value] of Object.entries(newValues)) {
    if (!(key in values) && value !== undefined) {
      values[key] = value;
    }
  }

  return {
    values,
    inheritedFields,
    modifiedFields,
    canceled: false,
  };
}

/**
 * Build extraction context from a previous extraction result.
 */
export function buildExtractionContext(
  values: Record<string, unknown>,
  confidence: Record<string, number>,
  provenance: Record<string, 'pattern' | 'onnx' | 'llm'>,
  intentName?: string,
  normalizedText?: string,
): ExtractionContext {
  return { values, confidence, provenance, intentName, normalizedText };
}
