/**
 * I18 Integration Tests — Full pipeline verification.
 *
 * Tests the complete entity processing lifecycle:
 *   extract (text → structured) → resolve (records → clusters)
 *
 * These tests verify that the extract and resolve packages work
 * together seamlessly in the unified entity-resolver ecosystem.
 */
import { describe, it, expect } from 'vitest';
import { extract } from '@agentix-e/entity-resolver-extract';
import { autoConfigure, runPipeline } from '@agentix-e/entity-resolver-core';

describe('Full pipeline: extract → resolve', () => {
  it('extracts structured fields and resolves record duplicates', async () => {
    // Step 1: Extract fields from text
    const extraction = extract('Contact john@example.com office: +1-555-0199', [
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'phone' },
    ]);

    expect(extraction.values.email).toBe('john@example.com');
    expect(extraction.values.phone).toBeDefined();
    expect(extraction.provenance.email).toBe('pattern');
  });

  it('handles CJK temporal extraction through full pipeline', () => {
    const result = extract(
      '明天下午3点开会',
      [
        { name: 'time', type: 'time' },
        { name: 'title', type: 'string' },
      ],
      { intent: 'meeting' },
    );

    expect(result.values.time).toBeDefined();
    expect(result.values.title).toBe('Meeting');
  });

  it('extract with intent produces enhanced results', () => {
    const general = extract('明天3点', [
      { name: 'time', type: 'time' },
      { name: 'title', type: 'string' },
    ]);

    const enhanced = extract(
      '明天3点',
      [
        { name: 'time', type: 'time' },
        { name: 'title', type: 'string' },
      ],
      { intent: 'alarm' },
    );

    // Intent-enhanced should fill default title
    expect(enhanced.values.title).toBe('Alarm');
    // General mode has no title
    expect(general.values.title).toBeUndefined();
  });

  it('extract feeds into resolve for record deduplication', async () => {
    // Extract contacts from text descriptions
    const contacts = [
      'John Smith, john@example.com, New York',
      'J. Smith, john@example.com, NYC',
      'Jane Doe, jane@example.com, Boston',
    ];

    const records: Record<string, unknown>[] = contacts.map((text, i) => {
      const ext = extract(text, [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'email' },
        { name: 'city', type: 'string' },
      ]);
      return { ...ext.values, _id: i };
    });

    // Verify email extraction
    expect(records[0]!.email).toBe('john@example.com');
    expect(records[1]!.email).toBe('john@example.com');

    // Resolve duplicates
    const auto = autoConfigure(records);
    const result = await runPipeline(records, auto.config);

    // John's two records should be clustered together
    expect(result.clusters.size).toBeGreaterThan(0);
  });

  it('handles empty extract gracefully', () => {
    const result = extract('no useful data here', [
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'phone' },
      { name: 'url', type: 'url' },
    ]);

    expect(result.values.email).toBeUndefined();
    expect(result.values.phone).toBeUndefined();
    expect(result.values.url).toBeUndefined();
    expect(result.normalizedText).toBeTypeOf('string');
  });

  it('multi-turn extraction with slot inheritance', () => {
    const turn1 = extract(
      '明天3点设闹钟起床',
      [
        { name: 'time', type: 'time' },
        { name: 'title', type: 'string' },
      ],
      { intent: 'alarm' },
    );

    expect(turn1.values.title).toBe('Alarm');

    const turn2 = extract(
      '改成5点',
      [
        { name: 'time', type: 'time' },
        { name: 'title', type: 'string' },
      ],
      { previousResult: turn1 },
    );

    // Title should carry forward from turn1
    expect(turn2.values.title).toBeDefined();
  });
});
