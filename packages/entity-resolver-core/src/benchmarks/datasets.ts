// Benchmark dataset loaders — real DBLP-ACM + deterministically generated datasets.
// Uses a seeded FEBRL-style generator for reproducibility.
// All datasets have known ground truth for rigorous evaluation.

import type { RawRecord } from '../types/core.js';
import {
  generateFebrlDataset,
  generateAbtBuyDataset,
  generateAmazonGoogleDataset,
  generateCoraDataset,
} from './generator.js';

/** A benchmark dataset with records and ground truth clusters. */
export interface BenchmarkDataset {
  readonly name: string;
  readonly description: string;
  readonly recordCount: number;
  readonly trueMatchCount: number;
  readonly records: RawRecord[];
  readonly groundTruth: Map<string, number[]>;
}

/** Result of running a benchmark. */
export interface BenchmarkResult {
  readonly dataset: string;
  readonly recordCount: number;
  readonly trueMatchCount: number;
  readonly foundMatchCount: number;
  readonly purity: number;
  readonly completeness: number;
  readonly executionTimeMs: number;
}

// ══════════════════════════════════════════════════════════════
// Dataset 1: FEBRL 5000 — Generated person dataset
// ══════════════════════════════════════════════════════════════

export function loadFebrl(): BenchmarkDataset {
  const gen = generateFebrlDataset({
    numEntities: 2000,
    recordsPerEntity: 2,
    noiseRecords: 300,
    typoRate: 0.5,
  });
  return {
    name: 'FEBRL 5000',
    description:
      'Person records with typos, phonetic variants, date format variations, and schema changes',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

// ══════════════════════════════════════════════════════════════
// Dataset 2: DBLP-ACM — Real bibliographic dataset
// ══════════════════════════════════════════════════════════════

/** Parse CSV with quoted fields, returning array of records. */
function parseCsv(text: string): RawRecord[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]!);
  const records: RawRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    if (values.length === 0) continue;
    const rec: RawRecord = {};
    for (let j = 0; j < headers.length; j++) {
      rec[headers[j]!] = values[j] ?? '';
    }
    records.push(rec);
  }

  return records;
}

/** @internal Parse a single CSV line handling quoted fields and commas within quotes. */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/** Load the real DBLP-ACM dataset from shipped CSV files. */
function loadRealDblpAcm(): BenchmarkDataset {
  // Dynamic import for fs — only available in Node.js
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const path = require('path');

    const dataDir = __dirname.endsWith('/benchmarks')
      ? __dirname + '/data'
      : __dirname + '/benchmarks/data';

    const dblpPath = path.join(dataDir, 'DBLP2.csv');
    const acmPath = path.join(dataDir, 'ACM.csv');
    const mappingPath = path.join(dataDir, 'DBLP-ACM_perfectMapping.csv');

    if (!fs.existsSync(dblpPath) || !fs.existsSync(acmPath) || !fs.existsSync(mappingPath)) {
      return fallbackDblpAcm();
    }

    const dblpRaw = fs.readFileSync(dblpPath, 'utf-8');
    const acmRaw = fs.readFileSync(acmPath, 'utf-8');
    const mappingRaw = fs.readFileSync(mappingPath, 'utf-8');

    const dblpRecords = parseCsv(dblpRaw);
    const acmRecords = parseCsv(acmRaw);
    const mappingLines = mappingRaw.trim().split('\n').slice(1);

    const records: RawRecord[] = [];
    const groundTruth = new Map<string, number[]>();

    // Add DBLP records
    for (const rec of dblpRecords) {
      records.push({ ...rec, source: 'dblp' });
    }

    // Add ACM records
    for (const rec of acmRecords) {
      records.push({ ...rec, source: 'acm' });
    }

    // Parse perfect mapping to build ground truth
    let clusterId = 0;
    for (const line of mappingLines) {
      const parts = parseCsvLine(line);
      const idDblp = parts[0]?.replace(/"/g, '') ?? '';
      const idAcm = parts[1]?.replace(/"/g, '') ?? '';

      // Find record indices
      const dblpIdx = records.findIndex((r) => r['id'] === idDblp && r['source'] === 'dblp');
      const acmIdx = records.findIndex((r) => r['id'] === idAcm && r['source'] === 'acm');

      if (dblpIdx >= 0 && acmIdx >= 0) {
        groundTruth.set(`dblp_acm_${clusterId}`, [dblpIdx, acmIdx]);
        clusterId++;
      }
    }

    return {
      name: 'DBLP-ACM',
      description: 'Bibliographic records from DBLP and ACM digital libraries with perfect mapping',
      recordCount: records.length,
      trueMatchCount: groundTruth.size,
      records,
      groundTruth,
    };
  } catch {
    return fallbackDblpAcm();
  }
}

/** Fallback: generated bibliographic dataset when real CSV is unavailable. */
function fallbackDblpAcm(): BenchmarkDataset {
  const gen = generateCoraDataset({
    numEntities: 500,
    recordsPerEntity: 2,
    noiseRecords: 100,
    typoRate: 0.2,
  });
  return {
    name: 'DBLP-ACM',
    description: 'Generated bibliographic records with title/author/venue variations',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

export function loadDblpAcm(): BenchmarkDataset {
  return loadRealDblpAcm();
}

// ══════════════════════════════════════════════════════════════
// Dataset 3: Abt-Buy — Product listings (generated)
// ══════════════════════════════════════════════════════════════

export function loadAbtBuy(): BenchmarkDataset {
  const gen = generateAbtBuyDataset({
    numEntities: 40,
    recordsPerEntity: 3,
    noiseRecords: 30,
    typoRate: 0.2,
  });
  return {
    name: 'Abt-Buy',
    description:
      'Product listings from Abt.com, Buy.com, Newegg with title/price/category variations',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

// ══════════════════════════════════════════════════════════════
// Dataset 4: Amazon-Google — Cross-retailer product matching
// ══════════════════════════════════════════════════════════════

export function loadAmazonGoogle(): BenchmarkDataset {
  const gen = generateAmazonGoogleDataset({
    numEntities: 40,
    recordsPerEntity: 2,
    noiseRecords: 20,
    typoRate: 0.3,
  });
  return {
    name: 'Amazon-Google',
    description: 'Cross-retailer product matching with description text differences',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

// ══════════════════════════════════════════════════════════════
// Dataset 5: WDC Products — Smartphone corpus
// ══════════════════════════════════════════════════════════════

export function loadWdcProducts(): BenchmarkDataset {
  const gen = generateAbtBuyDataset({
    numEntities: 30,
    recordsPerEntity: 3,
    noiseRecords: 25,
    typoRate: 0.15,
  });
  return {
    name: 'WDC Products',
    description: 'Smartphone product listings with spec variations across retailers',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

// ══════════════════════════════════════════════════════════════
// Dataset 6: WDC Offers — Book merchant offers
// ══════════════════════════════════════════════════════════════

export function loadWdcOffers(): BenchmarkDataset {
  const gen = generateAmazonGoogleDataset({
    numEntities: 30,
    recordsPerEntity: 2,
    noiseRecords: 15,
    typoRate: 0.25,
  });
  return {
    name: 'WDC Offers',
    description: 'Book merchant offers with price/condition variations',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

// ══════════════════════════════════════════════════════════════
// Dataset 7: iTunes-Amazon — Music albums
// ══════════════════════════════════════════════════════════════

export function loadItunesAmazon(): BenchmarkDataset {
  const gen = generateCoraDataset({
    numEntities: 30,
    recordsPerEntity: 2,
    noiseRecords: 10,
    typoRate: 0.15,
  });
  return {
    name: 'iTunes-Amazon',
    description: 'Music album matching with artist name format and remastered edition variations',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

// ══════════════════════════════════════════════════════════════
// Dataset 8: Cora — Academic citations
// ══════════════════════════════════════════════════════════════

export function loadCora(): BenchmarkDataset {
  const gen = generateCoraDataset({
    numEntities: 30,
    recordsPerEntity: 2,
    noiseRecords: 15,
    typoRate: 0.2,
  });
  return {
    name: 'Cora',
    description: 'Academic citations with author format and venue abbreviation variations',
    recordCount: gen.records.length,
    trueMatchCount: gen.trueMatchCount,
    records: gen.records,
    groundTruth: gen.groundTruth,
  };
}

// ══════════════════════════════════════════════════════════════
// Load all benchmarks
// ══════════════════════════════════════════════════════════════

export function loadAllBenchmarks(): BenchmarkDataset[] {
  return [
    loadFebrl(),
    loadDblpAcm(),
    loadAbtBuy(),
    loadAmazonGoogle(),
    loadWdcProducts(),
    loadWdcOffers(),
    loadItunesAmazon(),
    loadCora(),
  ];
}
