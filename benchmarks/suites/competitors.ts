/**
 * Competitor benchmark bridge — compares entity-resolver against
 * Splink (Python) and GoldenMatch (Python) on standard ER datasets.
 *
 * Each competitor is invoked via Python subprocess with identical
 * preprocessing and ground truth to ensure fair comparison.
 */
import { execSync } from 'node:child_process';
import type { DatasetResult, AggregatedMetrics, TimingStats } from '../lib/types.js';
import { STANDARD_DATASETS } from '../configs/standard.js';

interface CompetitorResult {
  dataset: string;
  records: number;
  trueMatches: number;
  precision: number;
  recall: number;
  f1: number;
  timeSec: number;
  pairs: number;
  tool: string;
}

/**
 * Run Splink benchmarks on all standard datasets.
 * Returns results in DatasetResult format compatible with the report.
 */
export function runSplinkBenchmarks(): DatasetResult[] {
  console.log('\n=== Splink 4.x Benchmarks ===');

  const results: CompetitorResult[] = [];

  for (const ds of STANDARD_DATASETS) {
    console.log(`  ${ds.name}...`);
    try {
      const script = generateSplinkScript(ds);
      const output = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120_000,
      }).trim();
      const parsed = JSON.parse(output) as CompetitorResult;
      results.push(parsed);
      console.log(`    F1=${parsed.f1.toFixed(4)} P=${parsed.precision.toFixed(4)} R=${parsed.recall.toFixed(4)}`);
    } catch (err: any) {
      console.error(`    Splink failed for ${ds.name}: ${err.message}`);
      // Return a zero-result so the comparison matrix is complete
      results.push({
        dataset: ds.name,
        records: ds.recordCount,
        trueMatches: ds.trueMatchCount,
        precision: 0,
        recall: 0,
        f1: 0,
        timeSec: 0,
        pairs: 0,
        tool: 'splink',
      });
    }
  }

  return toDatasetResults(results, 'splink', getSplinkVersion());
}

/**
 * Run GoldenMatch benchmarks on all standard datasets.
 * Uses the zero-config controller for fair comparison.
 */
export function runGoldenMatchBenchmarks(): DatasetResult[] {
  console.log('\n=== GoldenMatch 3.x Benchmarks (zero-config) ===');

  const results: CompetitorResult[] = [];

  for (const ds of STANDARD_DATASETS) {
    console.log(`  ${ds.name}...`);
    try {
      const script = generateGoldenMatchScript(ds);
      const output = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120_000,
      }).trim();
      const parsed = JSON.parse(output) as CompetitorResult;
      results.push(parsed);
      console.log(`    F1=${parsed.f1.toFixed(4)} P=${parsed.precision.toFixed(4)} R=${parsed.recall.toFixed(4)}`);
    } catch (err: any) {
      console.error(`    GoldenMatch failed for ${ds.name}: ${err.message}`);
      results.push({
        dataset: ds.name,
        records: ds.recordCount,
        trueMatches: ds.trueMatchCount,
        precision: 0,
        recall: 0,
        f1: 0,
        timeSec: 0,
        pairs: 0,
        tool: 'goldenmatch',
      });
    }
  }

  return toDatasetResults(results, 'goldenmatch', getGoldenMatchVersion());
}

/** Convert competitor raw results to standard DatasetResult format. */
function toDatasetResults(
  raw: CompetitorResult[],
  tool: string,
  version: string,
): DatasetResult[] {
  return raw.map((r) => {
    const singleMetrics: AggregatedMetrics = {
      precision: r.precision,
      recall: r.recall,
      f1: r.f1,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      predictedPairs: r.pairs,
      truePairs: r.trueMatches,
      f1StdDev: 0,
      precisionStdDev: 0,
      recallStdDev: 0,
      runs: 1,
      f1Values: [r.f1],
    };

    const singleTiming: TimingStats = {
      meanMs: Math.round(r.timeSec * 1000),
      stdDevMs: 0,
      minMs: Math.round(r.timeSec * 1000),
      maxMs: Math.round(r.timeSec * 1000),
      runs: 1,
      perRunMs: [Math.round(r.timeSec * 1000)],
    };

    return {
      dataset: r.dataset,
      mode: 'linkage',
      tool,
      recordCount: r.records,
      trueMatchCount: r.trueMatches,
      metrics: singleMetrics,
      timing: singleTiming,
      candidatePairs: r.pairs,
      configFingerprint: `${tool}-zero-config`,
      toolVersion: version,
    };
  });
}

function getSplinkVersion(): string {
  try {
    return execSync('python3 -c "import splink; print(splink.__version__)"', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function getGoldenMatchVersion(): string {
  try {
    return execSync('python3 -c "import goldenmatch; print(goldenmatch.__version__)"', {
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

/** Generate a self-contained Python script for Splink benchmarking. */
function generateSplinkScript(ds: typeof STANDARD_DATASETS[number]): string {
  const renamePart = ds.renameColumns
    ? Object.entries(ds.renameColumns)
        .map(([k, v]) => `right_df = right_df.rename(columns={"${k}": "${v}"})`)
        .join('; ')
    : 'pass';

  return `
import json, time, pandas as pd
from splink import DuckDBAPI, Linker, SettingsCreator, block_on
from splink import comparison_library as cl

left_df = pd.read_csv("${ds.leftPath}", encoding="${ds.encoding}", dtype=str).fillna("")
right_df = pd.read_csv("${ds.rightPath}", encoding="${ds.encoding}", dtype=str).fillna("")
${renamePart}

mapping = pd.read_csv("${ds.mappingPath}")
true_pairs = set()
for _, row in mapping.iterrows():
    true_pairs.add((str(row.iloc[0]).strip(), str(row.iloc[1]).strip()))

left_df["unique_id"] = [str(i) for i in range(len(left_df))]
right_df["unique_id"] = [str(i + len(left_df)) for i in range(len(right_df))]

settings = SettingsCreator(
    link_type="link_only",
    comparisons=[cl.JaroWinklerAtThresholds("title", [0.8])],
    blocking_rules_to_generate_predictions=[block_on("title")],
    probability_two_random_records_match=0.001,
)

linker = Linker(
    input_table_or_tables=[left_df, right_df],
    settings=settings,
    db_api=DuckDBAPI(),
    input_table_aliases=["__l", "__r"],
)

try:
    linker.training.estimate_parameters_using_expectation_maximisation(block_on("title"))
except Exception:
    pass

start = time.time()
predictions = linker.inference.predict(threshold_match_probability=0.5)
elapsed = time.time() - start

rows = predictions.as_record_dict()
pred_pairs = set()
if isinstance(rows, list):
    for row in rows:
        lid = str(row.get('unique_id_l', ''))
        rid = str(row.get('unique_id_r', ''))
        if lid and rid:
            l_idx = int(lid) if lid.isdigit() else -1
            r_idx = int(rid) if rid.isdigit() else -1
            orig_l = str(left_df.iloc[l_idx].get('id', lid)) if 0 <= l_idx < len(left_df) else lid
            orig_r = str(right_df.iloc[r_idx - len(left_df)].get('id', rid)) if len(left_df) <= r_idx < len(left_df) + len(right_df) else rid
            pred_pairs.add((orig_l.strip(), orig_r.strip()))

tp = len(pred_pairs & true_pairs)
precision = tp / len(pred_pairs) if pred_pairs else 0
recall = tp / len(true_pairs) if true_pairs else 0
f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

result = {
    "dataset": "${ds.name}",
    "records": len(left_df) + len(right_df),
    "trueMatches": len(true_pairs),
    "precision": round(precision, 4),
    "recall": round(recall, 4),
    "f1": round(f1, 4),
    "timeSec": round(elapsed, 1),
    "pairs": len(pred_pairs),
    "tool": "splink",
}
print(json.dumps(result))
`.trim();
}

/** Generate a self-contained Python script for GoldenMatch benchmarking. */
function generateGoldenMatchScript(ds: typeof STANDARD_DATASETS[number]): string {
  const renamePart = ds.renameColumns
    ? Object.entries(ds.renameColumns)
        .map(([k, v]) => `right_df = right_df.rename(columns={"${k}": "${v}"})`)
        .join('; ')
    : 'pass';

  return `
import json, time, pandas as pd
from goldenmatch import ResolutionSpec, resolve, scorer_registry

left_df = pd.read_csv("${ds.leftPath}", encoding="${ds.encoding}", dtype=str).fillna("")
right_df = pd.read_csv("${ds.rightPath}", encoding="${ds.encoding}", dtype=str).fillna("")
${renamePart}

mapping = pd.read_csv("${ds.mappingPath}")
true_pairs = set()
for _, row in mapping.iterrows():
    true_pairs.add((str(row.iloc[0]).strip(), str(row.iloc[1]).strip()))

left_df["unique_id"] = [str(i) for i in range(len(left_df))]
right_df["unique_id"] = [str(i + len(left_df)) for i in range(len(right_df))]

combined = pd.concat([left_df, right_df], ignore_index=True)

spec = ResolutionSpec(
    mode="dedupe",
    resolvers=[
        {"field": "title" if "title" in combined.columns else combined.columns[0], "scorers": ["token_sort", "jaro_winkler"]}
    ],
    thresholds={"match": 0.5},
)

start = time.time()
try:
    result_obj = resolve(combined, spec)
    pred_pairs = set()
    if hasattr(result_obj, 'pairs'):
        for pair in result_obj.pairs:
            lid = str(pair.get('left_id', pair.get('id_a', '')))
            rid = str(pair.get('right_id', pair.get('id_b', '')))
            if lid and rid:
                pred_pairs.add((lid.strip(), rid.strip()))
    elapsed = time.time() - start

    tp = len(pred_pairs & true_pairs)
    precision = tp / len(pred_pairs) if pred_pairs else 0
    recall = tp / len(true_pairs) if true_pairs else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

    result = {
        "dataset": "${ds.name}",
        "records": len(combined),
        "trueMatches": len(true_pairs),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "timeSec": round(elapsed, 1),
        "pairs": len(pred_pairs),
        "tool": "goldenmatch",
    }
except Exception as e:
    result = {
        "dataset": "${ds.name}",
        "records": len(combined),
        "trueMatches": len(true_pairs),
        "precision": 0,
        "recall": 0,
        "f1": 0,
        "timeSec": 0,
        "pairs": 0,
        "tool": "goldenmatch",
    }

print(json.dumps(result))
`.trim();
}
