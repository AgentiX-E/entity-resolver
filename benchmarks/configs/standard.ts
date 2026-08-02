/**
 * Standard ER dataset registry.
 *
 * Each entry maps a well-known dataset name to its files, ground-truth
 * mapping, and recommended entity-resolver pipeline configuration.
 *
 * All paths are relative to the repository root so benchmarks can be
 * executed from any CWD.
 */
import type { DatasetConfig } from '../lib/types.js';

/** Resolve a repo-relative path using import.meta.url. */
function repoPath(relative: string): string {
  // this file: .../entity-resolver/benchmarks/configs/standard.ts
  const configsDir = import.meta.url.substring(0, import.meta.url.lastIndexOf('/'));
  // .../entity-resolver/benchmarks
  const benchmarksDir = configsDir.substring(0, configsDir.lastIndexOf('/'));
  // .../entity-resolver
  const repoRoot = benchmarksDir.substring(0, benchmarksDir.lastIndexOf('/'));
  return `${repoRoot}/${relative}`;
}

export const STANDARD_DATASETS: DatasetConfig[] = [
  {
    name: 'DBLP-ACM',
    mode: 'linkage',
    recordCount: 4910,
    trueMatchCount: 2224,
    source: 'Leipzig Group (real bibliographic)',
    leftPath: repoPath('benchmarks/datasets/DBLP-ACM/DBLP2.csv'),
    rightPath: repoPath('benchmarks/datasets/DBLP-ACM/ACM.csv'),
    mappingPath: repoPath('benchmarks/datasets/DBLP-ACM/DBLP-ACM_perfectMapping.csv'),
    encoding: 'latin1',
  },
  {
    name: 'Abt-Buy',
    mode: 'linkage',
    recordCount: 2173,
    trueMatchCount: 1097,
    source: 'Leipzig Group (real product)',
    leftPath: repoPath('benchmarks/datasets/Abt-Buy/Abt.csv'),
    rightPath: repoPath('benchmarks/datasets/Abt-Buy/Buy.csv'),
    mappingPath: repoPath('benchmarks/datasets/Abt-Buy/abt_buy_perfectMapping.csv'),
    encoding: 'latin1',
  },
  {
    name: 'Amazon-Google',
    mode: 'linkage',
    recordCount: 4589,
    trueMatchCount: 1300,
    source: 'Leipzig Group (real cross-retailer)',
    leftPath: repoPath('benchmarks/datasets/Amazon-Google/Amazon.csv'),
    rightPath: repoPath('benchmarks/datasets/Amazon-Google/GoogleProducts.csv'),
    mappingPath: repoPath('benchmarks/datasets/Amazon-Google/Amzon_GoogleProducts_perfectMapping.csv'),
    encoding: 'latin1',
    renameColumns: { name: 'title' },
  },
];

/**
 * FEBRL synthetic datasets are generated deterministically
 * with a fixed seed rather than loaded from files.
 * This mirrors the LCG-based generator in the original benchmark
 * but with proper documentation of the process.
 */
export interface FebrlConfig {
  name: string;
  scale: number;       // base record count
  dupRate: number;     // fraction of records that have duplicates
  seed: number;
}

export const FEBRL_CONFIGS: FebrlConfig[] = [
  { name: 'FEBRL-1000', scale: 1000, dupRate: 0.2, seed: 42 },
  { name: 'FEBRL-5000', scale: 5000, dupRate: 0.2, seed: 42 },
];

/**
 * Generate deterministic FEBRL-style synthetic records.
 *
 * Uses a Lehmer random number generator (Park-Miller minimal standard)
 * for bit-exact reproducibility across runs and platforms.
 */
export function generateFebrlRecords(scale: number, seed: number): {
  records: Array<Record<string, string>>;
  groundTruth: Set<string>;
} {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let r = seed;
  const nf = (): number => {
    r = (r * 16807) % 2147483647;
    return (r - 1) / 2147483646;
  };

  // Generate base records
  // Build records with stable unique IDs assigned BEFORE shuffling.
  // This ensures that ground truth pairs are tracked by immutable identity
  // rather than positional index, which is correct even after Fisher-Yates.
  const records: Array<Record<string, string> & { _er_id: number }> = [];
  for (let i = 0; i < scale; i++) {
    let first = '';
    let last = '';
    for (let j = 0; j < 4 + Math.floor(nf() * 5); j++) first += chars[Math.floor(nf() * 26)];
    for (let j = 0; j < 5 + Math.floor(nf() * 6); j++) last += chars[Math.floor(nf() * 26)];
    records.push({
      _er_id: i,
      first: first.charAt(0).toUpperCase() + first.slice(1),
      last: last.charAt(0).toUpperCase() + last.slice(1),
    });
  }

  // Generate duplicates — each is a noisy copy of a base record.
  // Duplicate IDs are scale + duplicateIndex so they are disjoint from base IDs.
  const dupCount = Math.floor(scale * 0.2);
  for (let i = 0; i < dupCount; i++) {
    const orig = records[i % scale]!;
    records.push({
      _er_id: scale + i,
      first: nf() < 0.5 ? orig.first.slice(0, 3) + 'x' : orig.first,
      last: orig.last + (nf() < 0.5 ? 'son' : ''),
    });
  }

  // Fisher-Yates shuffle — records move, but _er_id stays attached.
  for (let i = records.length - 1; i > 0; i--) {
    const j = Math.floor(nf() * (i + 1));
    [records[i], records[j]] = [records[j]!, records[i]!];
  }

  // Ground truth: base record i is a match with its duplicate at scale+i.
  const groundTruth = new Set<string>();
  for (let i = 0; i < dupCount; i++) {
    groundTruth.add(`${i % scale}|${scale + i}`);
  }

  return { records: records as Array<Record<string, string>>, groundTruth };
}
