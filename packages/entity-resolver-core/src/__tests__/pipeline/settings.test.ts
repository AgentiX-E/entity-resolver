/**
 * Tests for SettingsCreator pattern (I38).
 *
 * Covers: construction, fluent API, serialization round-trip,
 * backward compatibility, validation, edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  SettingsCreator,
  dedupeSettings,
  linkageSettings,
  toPipelineConfig,
  fromPipelineConfig,
  settingsFromJSON,
} from '../../pipeline/settings.js';
import type { PipelineConfig } from '../../pipeline/runner.js';

/** Helper: create a simple comparison level with label + threshold. */
const lvl = (label: string, threshold = 0.5) => ({ label, threshold });

/** Helper: create a simple comparison spec with one level. */
const cmp = (field: string, scorer = 'exact') => ({
  field,
  scorerName: scorer,
  levels: [lvl('match')],
}) as const;

/** Helper: simple blocking rule. */
const blk = (fields: string[], transforms: string[] = ['lowercase']) => ({
  fields,
  transforms: transforms as Array<'lowercase' | 'uppercase' | 'strip' | 'soundex' | 'digits_only' | 'alpha_only' | 'metaphone'>,
}) as const;

// ═══════════════════════════════════════════════════════════════
// Construction & Fluent API
// ═══════════════════════════════════════════════════════════════

describe('SettingsCreator construction', () => {
  it('creates for dedupe_only', () => {
    const settings = new SettingsCreator('dedupe_only')
      .addComparison(cmp('name', 'jaro_winkler'))
      .addBlockingRule(blk(['name']))
      .build();

    expect(settings.linkType).toBe('dedupe_only');
    expect(settings.comparisons).toHaveLength(1);
    expect(settings.blockingRules).toHaveLength(1);
  });

  it('creates for link_only', () => {
    const settings = new SettingsCreator('link_only')
      .addComparison(cmp('title', 'ensemble'))
      .addBlockingRule(blk(['title']))
      .withMatchThreshold(0.8)
      .build();

    expect(settings.linkType).toBe('link_only');
    expect(settings.matchThreshold).toBe(0.8);
  });

  it('creates for link_and_dedupe', () => {
    const settings = new SettingsCreator('link_and_dedupe')
      .addComparison(cmp('name'))
      .addBlockingRule(blk(['name']))
      .build();

    expect(settings.linkType).toBe('link_and_dedupe');
  });

  it('supports adding multiple comparisons at once', () => {
    const settings = new SettingsCreator('dedupe_only')
      .addComparisons([
        cmp('name', 'jaro_winkler'),
        cmp('email'),
      ])
      .addBlockingRule(blk(['name']))
      .build();

    expect(settings.comparisons).toHaveLength(2);
    expect(settings.comparisons[0]!.field).toBe('name');
    expect(settings.comparisons[1]!.field).toBe('email');
  });

  it('supports adding multiple blocking rules', () => {
    const settings = new SettingsCreator('dedupe_only')
      .addComparison(cmp('name', 'jaro_winkler'))
      .addBlockingRules([
        blk(['name']),
        blk(['name'], ['lowercase', 'soundex']),
      ])
      .build();

    expect(settings.blockingRules).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Fluent Method Chaining
// ═══════════════════════════════════════════════════════════════

describe('SettingsCreator fluent API', () => {
  it('allows method chaining', () => {
    const settings = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']))
      .withMatchThreshold(0.75)
      .withTermFrequencyAdjustment(['surname'])
      .withUniqueIdColumn('record_id')
      .withEmConvergence(0.001)
      .withMaxIterations(30)
      .withProbabilityTwoRandomRecordsMatch(0.001)
      .build();

    expect(settings.linkType).toBe('dedupe_only');
    expect(settings.matchThreshold).toBe(0.75);
    expect(settings.tfFields).toEqual(['surname']);
    expect(settings.uniqueIdColumn).toBe('record_id');
    expect(settings.emConvergence).toBe(0.001);
    expect(settings.maxIterations).toBe(30);
    expect(settings.probabilityTwoRandomRecordsMatch).toBe(0.001);
  });

  it('withLinkType changes link type', () => {
    const settings = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']))
      .withLinkType('link_only')
      .build();

    expect(settings.linkType).toBe('link_only');
  });
});

// ═══════════════════════════════════════════════════════════════
// Quick-start helpers
// ═══════════════════════════════════════════════════════════════

describe('dedupeSettings / linkageSettings', () => {
  it('dedupeSettings creates with correct link type', () => {
    const s = dedupeSettings()
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']))
      .build();
    expect(s.linkType).toBe('dedupe_only');
  });

  it('linkageSettings creates with correct link type', () => {
    const s = linkageSettings()
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']))
      .build();
    expect(s.linkType).toBe('link_only');
  });
});

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

describe('SettingsCreator validation', () => {
  it('throws when no comparisons added', () => {
    const creator = new SettingsCreator('dedupe_only')
      .addBlockingRule(blk(['name']));
    expect(() => creator.build()).toThrow('at least one comparison');
  });

  it('throws when no blocking rules added', () => {
    const creator = new SettingsCreator('dedupe_only')
      .addComparison(cmp('name', 'jaro_winkler'));
    expect(() => creator.build()).toThrow('at least one blocking rule');
  });

  it('throws for invalid match threshold', () => {
    const base = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']));
    expect(() => base.build()).not.toThrow();
    expect(() => base.withMatchThreshold(1.5).build()).toThrow('matchThreshold');
    expect(() => base.withMatchThreshold(-0.1).build()).toThrow('matchThreshold');
  });

  it('accepts boundary threshold values', () => {
    const settings0 = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']))
      .withMatchThreshold(0).build();
    expect(settings0.matchThreshold).toBe(0);

    const settings1 = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']))
      .withMatchThreshold(1).build();
    expect(settings1.matchThreshold).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Serialization Round-Trip
// ═══════════════════════════════════════════════════════════════

describe('SettingsCreator serialization', () => {
  it('JSON round-trip is lossless', () => {
    const builder = new SettingsCreator('dedupe_only')
      .addComparison(cmp('name', 'ensemble'))
      .addBlockingRule(blk(['name', 'email']))
      .withMatchThreshold(0.7)
      .withTermFrequencyAdjustment(['surname']);

    const original = builder.build();
    const json = builder.toJSON();
    const restored = settingsFromJSON(json);

    expect(restored.linkType).toBe(original.linkType);
    expect(restored.matchThreshold).toBe(original.matchThreshold);
    expect(restored.comparisons).toHaveLength(original.comparisons.length);
    expect(restored.blockingRules).toHaveLength(original.blockingRules.length);
    expect(restored.tfFields).toEqual(original.tfFields);
  });

  it('handles optional fields in round-trip', () => {
    const b = new SettingsCreator('link_only')
      .addComparison(cmp('title', 'jaro_winkler'))
      .addBlockingRule(blk(['title']))
      .withUniqueIdColumn('record_key')
      .withEmConvergence(0.00005)
      .withMaxIterations(50);

    const json = b.toJSON();
    const restored = settingsFromJSON(json);

    expect(restored.uniqueIdColumn).toBe('record_key');
    expect(restored.emConvergence).toBe(0.00005);
    expect(restored.maxIterations).toBe(50);
  });

  it('handles minimal settings without optional fields', () => {
    const b = new SettingsCreator('dedupe_only')
      .addComparison(cmp('name', 'jaro_winkler'))
      .addBlockingRule(blk(['name']));

    const json = b.toJSON();
    const restored = settingsFromJSON(json);

    expect(restored.linkType).toBe('dedupe_only');
    expect(restored.matchThreshold).toBe(0.7);
    expect(restored.uniqueIdColumn).toBeUndefined();
    expect(restored.tfFields).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Backward Compatibility
// ═══════════════════════════════════════════════════════════════

describe('backward compatibility', () => {
  it('converts legacy PipelineConfig to PipelineSettings', () => {
    const legacyConfig: PipelineConfig = {
      blocking: {
        passes: [{ fields: ['name'], transforms: ['lowercase'] }],
      },
      comparisons: [
        { field: 'name', scorerName: 'jaro_winkler', levels: [{ label: 'exact_match', threshold: 0.99 }] },
      ],
      matchThreshold: 0.6,
      autoConfigure: false,
    };

    const settings = fromPipelineConfig(legacyConfig, 'dedupe_only');
    expect(settings.linkType).toBe('dedupe_only');
    expect(settings.comparisons).toHaveLength(1);
    expect(settings.blockingRules).toHaveLength(1);
    expect(settings.matchThreshold).toBe(0.6);
  });

  it('converts PipelineSettings back to PipelineConfig', () => {
    const settings = new SettingsCreator('dedupe_only')
      .addComparison(cmp('name', 'ensemble'))
      .addBlockingRule(blk(['name']))
      .withMatchThreshold(0.75)
      .build();

    const config = toPipelineConfig(settings);
    expect(config.matchThreshold).toBe(0.75);
    expect(config.comparisons).toHaveLength(1);
    expect(config.blocking.passes).toHaveLength(1);
    expect(config.autoConfigure).toBe(false);
  });

  it('fromPipelineConfig + toPipelineConfig is identity', () => {
    const legacyConfig: PipelineConfig = {
      blocking: {
        passes: [
          { fields: ['title'], transforms: ['lowercase'] },
          { fields: ['authors'], transforms: ['lowercase', 'soundex'] },
        ],
      },
      comparisons: [
        { field: 'title', scorerName: 'jaro_winkler', levels: [{ label: 'match', threshold: 0.5 }] },
      ],
      matchThreshold: 0.5,
      autoConfigure: false,
    };

    const settings = fromPipelineConfig(legacyConfig, 'link_only');
    const backToConfig = toPipelineConfig(settings);

    expect(backToConfig.matchThreshold).toBe(0.5);
    expect(backToConfig.blocking.passes).toHaveLength(2);
    expect(backToConfig.comparisons).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════

describe('SettingsCreator edge cases', () => {
  it('handles empty TF fields gracefully', () => {
    const settings = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']))
      .withTermFrequencyAdjustment([])
      .build();

    expect(settings.tfFields).toEqual([]);
  });

  it('toJSON produces valid parseable JSON', () => {
    const builder = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']));

    const json = builder.toJSON();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('build() is idempotent — same builder produces same settings', () => {
    const builder = new SettingsCreator('dedupe_only')
      .addComparison(cmp('a'))
      .addBlockingRule(blk(['a']));

    const s1 = builder.build();
    // Building again should produce the same output
    const s2 = builder.build();
    expect(s1).toEqual(s2);
  });

  it('fromAutoConfig does not mutate original config', () => {
    const original = {
      config: {
        comparisons: [{ field: 'name', scorerName: 'jaro_winkler' as const, levels: [{ label: 'match', threshold: 0.5 }] }],
        blocking: { passes: [{ fields: ['name'], transforms: ['lowercase' as const] }] },
        matchThreshold: 0.5,
      },
    };

    const creator = new SettingsCreator('dedupe_only').fromAutoConfig(original);
    const settings = creator.build();

    // Original should be unchanged
    expect(original.config.comparisons).toHaveLength(1);
    expect(settings.comparisons).toHaveLength(1);
  });
});