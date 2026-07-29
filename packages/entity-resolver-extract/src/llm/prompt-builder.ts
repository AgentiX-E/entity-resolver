/**
 * Prompt Builder — Constructs LLM extraction prompts from field descriptors.
 *
 * Generates a system message with JSON Schema output format and
 * field-specific extraction instructions. The LLM is prompted to return
 * a JSON object with field names as keys and extracted values.
 *
 * Architecture: Instructor-style schema-driven prompting.
 * The prompt is designed for DeepSeek (OpenAI-compatible API) but
 * works with any chat completion endpoint.
 */

import type { FieldDescriptor } from '../extractor.js';

export interface PromptInput {
  /** Normalized input text to extract from */
  text: string;
  /** Field descriptors defining what to extract */
  fields: FieldDescriptor[];
  /** Optional intent context for focused extraction */
  intent?: string;
}

export interface PromptOutput {
  /** System message with JSON Schema and instructions */
  systemMessage: string;
  /** User message with the text to analyze */
  userMessage: string;
}

/**
 * Build system and user prompts for entity extraction.
 *
 * The system prompt includes:
 *   1. Role definition: "You are an entity extraction system"
 *   2. JSON Schema: field names with types and descriptions
 *   3. Output format: valid JSON only, no commentary
 *   4. Fallback guidance: set null for unextractable fields
 *
 * The user prompt is the text to extract from.
 */
export function buildExtractionPrompt(input: PromptInput): PromptOutput {
  const fieldSchemas = input.fields
    .map((f) => {
      const typeHint = getTypeHint(f.type);
      const desc = f.description ?? f.name;
      return `  "${f.name}": ${typeHint} // ${desc}`;
    })
    .join('\n');

  const requiredFields = input.fields
    .filter((f) => f.required)
    .map((f) => `"${f.name}"`)
    .join(', ');

  const optionalFields = input.fields
    .filter((f) => !f.required)
    .map((f) => `"${f.name}"`)
    .join(', ');

  let intentHint = '';
  if (input.intent) {
    intentHint = `\nContext: The user wants to ${input.intent}. Prioritize fields relevant to this intent.`;
  }

  const systemMessage =
    `You are a precise entity extraction system. Extract structured data from user text.\n` +
    `Return ONLY a valid JSON object with these fields:\n` +
    `{\n${fieldSchemas}\n}\n\n` +
    `Rules:\n` +
    `- Return valid JSON only, no markdown, no explanation\n` +
    `- Set missing or unextractable fields to null\n` +
    (requiredFields ? `- Required fields: ${requiredFields}\n` : '') +
    (optionalFields ? `- Optional fields: ${optionalFields}\n` : '') +
    `- Preserve the original meaning, do not fabricate values\n` +
    `- For dates/times, use ISO 8601 format (YYYY-MM-DD, HH:MM:SS)\n` +
    `${intentHint}`;

  return {
    systemMessage,
    userMessage: input.text,
  };
}

/**
 * Map field type to a JSON Schema type hint for the prompt.
 */
function getTypeHint(type: string): string {
  switch (type) {
    case 'number':
    case 'integer':
      return 'number | null';
    case 'boolean':
      return 'boolean | null';
    case 'date':
    case 'datetime':
      return 'string (ISO 8601) | null';
    case 'time':
      return 'string (HH:MM:SS) | null';
    case 'email':
    case 'phone':
    case 'url':
      return 'string | null';
    default:
      return 'string | null';
  }
}

/**
 * Extract the JSON object from an LLM response.
 * Handles various response formats:
 *   - Pure JSON: `{"field": "value"}`
 *   - JSON in markdown: ```json...```
 *   - JSON with surrounding text
 */
export function parseLLMResponse(response: string): Record<string, unknown> | null {
  const trimmed = response.trim();

  // Try pure JSON first
  try {
    const result = JSON.parse(trimmed);
    if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
  } catch {
    // Not pure JSON — try to extract
  }

  // Try extracting from markdown code blocks
  const codeBlock = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(trimmed);
  if (codeBlock?.[1]) {
    try {
      const result = JSON.parse(codeBlock[1].trim());
      if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
        return result as Record<string, unknown>;
      }
    } catch {
      // Failed to parse code block
    }
  }

  // Try to find a JSON object in the text
  const jsonObject = /\{[\s\S]*\}/.exec(trimmed);
  if (jsonObject) {
    try {
      const result = JSON.parse(jsonObject[0]);
      if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
        return result as Record<string, unknown>;
      }
    } catch {
      // Failed
    }
  }

  return null;
}
