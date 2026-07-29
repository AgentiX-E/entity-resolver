import { describe, it, expect } from 'vitest';
import { buildExtractionPrompt, parseLLMResponse } from '../prompt-builder.js';

describe('buildExtractionPrompt', () => {
  it('generates system and user messages', () => {
    const result = buildExtractionPrompt({
      text: 'John is 25 years old',
      fields: [
        { name: 'name', type: 'string', description: 'Person name' },
        { name: 'age', type: 'number', description: 'Age in years' },
      ],
    });

    expect(result.systemMessage).toContain('entity extraction system');
    expect(result.systemMessage).toContain('"name"');
    expect(result.systemMessage).toContain('"age"');
    expect(result.systemMessage).toContain('number | null');
    expect(result.systemMessage).toContain('ISO 8601');
    expect(result.userMessage).toBe('John is 25 years old');
  });

  it('includes intent context when provided', () => {
    const result = buildExtractionPrompt({
      text: '明天3点',
      fields: [{ name: 'time', type: 'time' }],
      intent: 'alarm',
    });

    expect(result.systemMessage).toContain('alarm');
    expect(result.systemMessage).toContain('Prioritize');
  });

  it('marks required fields', () => {
    const result = buildExtractionPrompt({
      text: 'test',
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'name', type: 'string' },
      ],
    });

    expect(result.systemMessage).toContain('Required fields: "email"');
    expect(result.systemMessage).toContain('Optional fields: "name"');
  });

  it('generates correct type hints', () => {
    const result = buildExtractionPrompt({
      text: 'test',
      fields: [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'number' },
        { name: 'c', type: 'boolean' },
        { name: 'd', type: 'date' },
        { name: 'e', type: 'time' },
        { name: 'f', type: 'email' },
      ],
    });

    expect(result.systemMessage).toContain('string | null');
    expect(result.systemMessage).toContain('number | null');
    expect(result.systemMessage).toContain('boolean | null');
    expect(result.systemMessage).toContain('HH:MM:SS');
  });
});

describe('parseLLMResponse', () => {
  it('parses pure JSON', () => {
    const result = parseLLMResponse('{"name":"John","age":25}');
    expect(result).toEqual({ name: 'John', age: 25 });
  });

  it('parses JSON with surrounding whitespace', () => {
    const result = parseLLMResponse('  {"name":"John"}  ');
    expect(result).toEqual({ name: 'John' });
  });

  it('parses JSON in markdown code block', () => {
    const result = parseLLMResponse('Here is the result:\n```json\n{"name":"John"}\n```');
    expect(result).toEqual({ name: 'John' });
  });

  it('parses JSON in code block without language tag', () => {
    const result = parseLLMResponse('```\n{"name":"John"}\n```');
    expect(result).toEqual({ name: 'John' });
  });

  it('extracts JSON object from surrounding text', () => {
    const result = parseLLMResponse('The result is {"name":"John"} and that is all.');
    expect(result).toEqual({ name: 'John' });
  });

  it('handles nested JSON objects', () => {
    const result = parseLLMResponse('{"person":{"name":"John","age":25}}');
    expect(result).toEqual({ person: { name: 'John', age: 25 } });
  });

  it('returns null for non-JSON text', () => {
    const result = parseLLMResponse('This is just plain text.');
    expect(result).toBeNull();
  });

  it('extracts JSON object from within array', () => {
    // Arrays are not directly valid, but we extract the inner JSON object
    const result = parseLLMResponse('[{"name":"John"}]');
    // The function extracts the embedded JSON object
    expect(result).toEqual({ name: 'John' });
  });

  it('returns null for invalid JSON in code block', () => {
    const result = parseLLMResponse('```json\n{invalid}\n```');
    expect(result).toBeNull();
  });

  it('handles empty response', () => {
    const result = parseLLMResponse('');
    expect(result).toBeNull();
  });
});
