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
  let r = seed;
  const nf = (): number => {
    r = (r * 16807) % 2147483647;
    return (r - 1) / 2147483646;
  };

  // Realistic given name pool
  const firstNames = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
    'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa',
    'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
    'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna',
    'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa',
  ];

  // Realistic surname pool
  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill',
    'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell',
  ];

  const pick = (arr: readonly string[]): string => arr[Math.floor(nf() * arr.length)]!;

  // Generate base records with stable unique IDs assigned BEFORE shuffling.
  const records: Array<Record<string, string> & { _er_id: number }> = [];
  for (let i = 0; i < scale; i++) {
    records.push({
      _er_id: i,
      first: pick(firstNames),
      last: pick(lastNames),
    });
  }

  // Generate duplicates — realistic variations of original records.
  const dupCount = Math.floor(scale * 0.2);
  for (let i = 0; i < dupCount; i++) {
    const orig = records[i % scale]!;
    const variationType = Math.floor(nf() * 5);

    let first: string;
    let last: string;

    switch (variationType) {
      case 0: // Typo: swap two adjacent characters
        first = orig.first.length > 3
          ? orig.first.slice(0, 1) + orig.first.charAt(2) + orig.first.charAt(1) + orig.first.slice(3)
          : orig.first + 'x';
        last = orig.last.length > 3
          ? orig.last.slice(0, -2) + orig.last.charAt(orig.last.length - 1) + orig.last.charAt(orig.last.length - 2)
          : orig.last;
        break;
      case 1: // Single character deletion
        first = orig.first.length > 2 ? orig.first.slice(0, -1) : orig.first;
        last = orig.last;
        break;
      case 2: // Single character insertion
        first = orig.first + 'abcdefghijklmnopqrstuvwxyz'[Math.floor(nf() * 26)];
        last = orig.last;
        break;
      case 3: // Nickname (first 3 chars only)
        first = orig.first.slice(0, 3);
        last = orig.last;
        break;
      default: // Truncation of last name
        first = orig.first;
        last = orig.last.slice(0, Math.max(3, orig.last.length - 2));
    }

    records.push({ _er_id: scale + i, first, last });
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
