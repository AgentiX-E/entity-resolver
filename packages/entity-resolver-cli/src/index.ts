// @agentix-e/entity-resolver-cli — CLI entry point.
// Command-line tool for entity resolver deduplication, matching, and diagnostics.

import { readFileSync } from 'node:fs';

// TUI Diagnostics
export {
  renderWaterfallTUI,
  renderHistogramTUI,
  renderMuTableTUI,
  renderClusterTreeTUI,
  renderThresholdTUI,
  renderNavHint,
} from './tui/renderers.js';

/** Parse a CSV file into records. Handles quoted fields. */
function readCsvFile(path: string): Record<string, unknown>[] {
  const text = readFileSync(path, 'utf-8');
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error(`Empty or invalid CSV: ${path}`);
  const headers = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const rec: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      rec[headers[j]!] = values[j] ?? '';
    }
    return rec;
  });
}

/** Parse a single CSV line handling quoted fields. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += c; }
  }
  result.push(current.trim());
  return result;
}

/**
 * CLI entry point — called when the package is invoked as a command.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0]!;

  switch (command) {
    case 'health': return cmdHealth();
    case 'help': printHelp(); return;
    case 'dedupe': return cmdDedupe(args.slice(1));
    case 'match': return cmdMatch(args.slice(1));
    case 'link': return cmdMatch(args.slice(1)); // alias
    case 'gazetteer': return cmdGazetteer(args.slice(1));
    case 'benchmark': return cmdBenchmark(args.slice(1));
    case 'autoconfigure': return cmdAutoconfigure(args.slice(1));
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run `entity-resolver --help` for usage information.');
      process.exitCode = 1;
  }
}

function cmdHealth(): void {
  console.log('Entity Resolver CLI — operational');
  console.log(`Node.js ${process.version}`);
}

async function cmdDedupe(args: string[]): Promise<void> {
  const file = args[0];
  if (!file) { console.error('Usage: entity-resolver dedupe <file.csv> [--threshold N]'); process.exitCode = 1; return; }
  try {
    const records = readCsvFile(file);
    const threshold = parseFloatFlag(args, '--threshold') ?? 0.5;
    const { runPipeline, autoConfigure } = await import('@agentix-e/entity-resolver-core');
    const auto = autoConfigure(records);
    const result = await runPipeline(records, { ...auto.config, matchThreshold: threshold });
    console.log(`Records: ${result.statistics.totalRecords}`);
    console.log(`Clusters: ${result.statistics.totalClusters}`);
    console.log(`Match rate: ${(result.statistics.matchRate * 100).toFixed(1)}%`);
    console.log(`Time: ${result.statistics.executionTimeMs}ms`);
  } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; }
}

async function cmdMatch(args: string[]): Promise<void> {
  const [leftFile, rightFile] = args;
  if (!leftFile || !rightFile) { console.error('Usage: entity-resolver match <left.csv> <right.csv> [--threshold N]'); process.exitCode = 1; return; }
  try {
    const left = readCsvFile(leftFile);
    const right = readCsvFile(rightFile);
    const threshold = parseFloatFlag(args, '--threshold') ?? 0.5;
    const { linkRecords, autoConfigure } = await import('@agentix-e/entity-resolver-core');
    const auto = autoConfigure([...left, ...right]);
    const result = await linkRecords(left, right, { ...auto.config, matchThreshold: threshold });
    console.log(`Cross pairs: ${result.crossPairs.length}`);
    console.log(`Match rate: ${result.statistics.matchRate}`);
  } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; }
}

async function cmdGazetteer(args: string[]): Promise<void> {
  const [queryFile, indexFile] = args;
  if (!queryFile || !indexFile) { console.error('Usage: entity-resolver gazetteer <query.csv> <index.csv> [--threshold N]'); process.exitCode = 1; return; }
  try {
    const queries = readCsvFile(queryFile);
    const index = readCsvFile(indexFile);
    const threshold = parseFloatFlag(args, '--threshold') ?? 0.5;
    const { gazetteerMatch, autoConfigure } = await import('@agentix-e/entity-resolver-core');
    const auto = autoConfigure([...queries, ...index]);
    const result = await gazetteerMatch(queries, index, { ...auto.config, matchThreshold: threshold });
    console.log(`Matches: ${result.queryToIndexMatches.length}`);
  } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; }
}

async function cmdBenchmark(args: string[]): Promise<void> {
  const datasetFilter = args[0];
  try {
    const { runAllBenchmarks, formatBenchmarkReport } = await import('@agentix-e/entity-resolver-core');
    const { results } = await runAllBenchmarks();
    const filtered = datasetFilter ? results.filter((r) => r.dataset.includes(datasetFilter)) : results;
    console.log(formatBenchmarkReport(filtered));
  } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; }
}

async function cmdAutoconfigure(args: string[]): Promise<void> {
  const file = args[0];
  if (!file) { console.error('Usage: entity-resolver autoconfigure <file.csv>'); process.exitCode = 1; return; }
  try {
    const records = readCsvFile(file);
    const { autoConfigure } = await import('@agentix-e/entity-resolver-core');
    const result = autoConfigure(records);
    console.log('Detected fields:');
    for (const f of result.fields) {
      console.log(`  ${f.name} → ${f.semanticType} (cardinality: ${f.cardinality})`);
    }
    console.log(`\nComparisons: ${result.config.comparisons.length}`);
    console.log(`Threshold: ${result.config.matchThreshold}`);
  } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; }
}

function parseFloatFlag(args: string[], flag: string): number | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    const val = parseFloat(args[idx + 1]!);
    return Number.isNaN(val) ? undefined : val;
  }
  return undefined;
}

function printHelp(): void {
  console.log(`Entity Resolver CLI

Usage: entity-resolver <command> [options]

Commands:
  health                    Check CLI health and Node.js version
  help                      Show this help message

  dedupe <file> [--threshold N]     Deduplicate records in a CSV/JSON file
  match <left> <right> [--threshold N]  Cross-dataset record linkage
  link <left> <right> [--threshold N]   Alias for match
  gazetteer <query> <index> [--threshold N]  Gazetteer matching
  benchmark [dataset]               Run benchmarks (all or specific)
  autoconfigure <file>             Auto-detect field semantics

Options:
  --threshold N    Match threshold (0-1, default 0.5)

TUI Renderers (imported programmatically):
  renderWaterfallTUI    Render match weight waterfall chart
  renderHistogramTUI    Render match weight distribution histogram
  renderMuTableTUI      Render m/u parameter table
  renderClusterTreeTUI  Render cluster tree explorer
  renderThresholdTUI    Render threshold selection UI
  renderNavHint         Render navigation hint line
`);
}

// Wire up as CLI when executed directly
if (
  process.argv[1]?.endsWith('/entity-resolver-cli') ||
  process.argv[1]?.endsWith('\\entity-resolver-cli')
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
