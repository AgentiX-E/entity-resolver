/**
 * U-Pipe Stage 1+2: Auto-Block + Auto-Score engine.
 * Bridges MatchingSOP → executable PipelineConfig.
 */
import type { MatchingSOP, BlockingStrategy } from '../pipeline/unified.js';
import type { PipelineConfig } from '../pipeline/runner.js';

// ═══════════════════════ Stage 1: Auto-Block ══════════════════

export function selectBlockingStrategies(sop: MatchingSOP): BlockingStrategy[] {
  const s: BlockingStrategy[] = [];
  for (const f of sop.fieldHierarchy.critical.slice(0, 2)) {
    s.push({ name: `exact_${f}`, type: 'exact', fields: [f], transforms: ['lowercase'] });
  }
  for (const f of sop.fieldHierarchy.high.slice(0, 2)) {
    s.push({ name: `fuzzy_${f}`, type: 'token', fields: [f], transforms: ['lowercase'] });
    s.push({ name: `soundex_${f}`, type: 'soundex', fields: [f], transforms: ['soundex'] });
  }
  if (s.length === 0) s.push({ name: 'all', type: 'composite', fields: [], transforms: ['lowercase'] });
  return s;
}

// ═══════════════════════ Stage 2: Auto-Score ══════════════════

export interface AutoComparisonSpec {
  readonly field: string;
  readonly scorerName: string;
  readonly levels: ReadonlyArray<{
    readonly label: string;
    readonly threshold: number;
    readonly isExact?: boolean;
  }>;
}

export function selectComparisons(
  sop: MatchingSOP,
  fieldTypes: Readonly<Record<string, string>>,
): AutoComparisonSpec[] {
  const specs: AutoComparisonSpec[] = [];
  const all = new Set([...sop.fieldHierarchy.critical, ...sop.fieldHierarchy.high, ...sop.fieldHierarchy.medium]);
  for (const f of all) {
    const ft = fieldTypes[f] ?? 'text';
    const tol = sop.tolerances[f] ?? [];
    const isCrt = sop.fieldHierarchy.critical.includes(f);
    if (ft === 'identifier' || ft === 'email' || ft === 'phone' || isCrt) {
      specs.push({ field: f, scorerName: 'exact', levels: [{ label: 'match', threshold: 1.0, isExact: true }] });
    } else if (ft === 'price' || ft === 'numeric') {
      specs.push({ field: f, scorerName: 'exact', levels: [{ label: 'match', threshold: 1.0, isExact: true }] });
    } else if (tol.includes('reorder') || tol.includes('abbreviation')) {
      specs.push({ field: f, scorerName: 'jaro_winkler', levels: [
        { label: 'strong_match', threshold: 0.95 }, { label: 'moderate_match', threshold: 0.8 }, { label: 'weak_match', threshold: 0.6 }] });
    } else {
      specs.push({ field: f, scorerName: 'jaro_winkler', levels: [
        { label: 'strong_match', threshold: 0.9 }, { label: 'moderate_match', threshold: 0.7 }] });
    }
  }
  return specs;
}

// ═══════════════════════ Config Builder ═══════════════════════

export function buildPipelineConfig(
  sop: MatchingSOP,
  fieldTypes: Readonly<Record<string, string>>,
  options?: { readonly useLLM?: boolean; readonly llmApiKey?: string },
): PipelineConfig {
  const comps = selectComparisons(sop, fieldTypes);
  const strats = selectBlockingStrategies(sop);
  const config: Record<string, unknown> = {
    comparisons: comps,
    blocking: { passes: strats.slice(0, 3).map((s) => ({
      fields: s.fields.length > 0 ? s.fields : ['_all'],
      transforms: s.transforms,
    }))},
    matchThreshold: 0.5,
  };
  if (options?.useLLM && options?.llmApiKey) {
    config.llmRerank = { apiKey: options.llmApiKey, provider: 'deepseek', topK: 20, minCandidateScore: 0.3 };
  }
  return config as unknown as PipelineConfig;
}

export function detectCJK(records: readonly Record<string, unknown>[], fields: readonly string[]): boolean {
  for (const r of records.slice(0, 50)) {
    for (const f of fields) {
      if (/[\u4e00-\u9fff]/.test(String(r[f] ?? ''))) return true;
    }
  }
  return false;
}
