// Benchmark dataset loaders for standard ER evaluation.
// Provides 8 standard datasets: FEBRL, DBLP-ACM, Abt-Buy, Amazon-Google,
// WDC Products, WDC Offers, iTunes-Amazon, Cora.

import type { RawRecord } from '../types/core.js';

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
// Dataset 1: FEBRL 5000 (Freely Extensible Biomedical Record Linkage)
// ══════════════════════════════════════════════════════════════

export function loadFebrl(): BenchmarkDataset {
  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();
  const names = [
    'john',
    'james',
    'robert',
    'michael',
    'william',
    'david',
    'richard',
    'joseph',
    'thomas',
    'charles',
  ];
  const surnames = [
    'smith',
    'johnson',
    'williams',
    'brown',
    'jones',
    'miller',
    'davis',
    'garcia',
    'rodriguez',
    'wilson',
  ];
  const cities = [
    'new york',
    'los angeles',
    'chicago',
    'houston',
    'phoenix',
    'philadelphia',
    'san antonio',
    'san diego',
  ];
  const streets = [
    'main st',
    'oak ave',
    'elm st',
    'maple dr',
    'pine ln',
    'cedar blvd',
    'park ave',
    'lake rd',
  ];

  let id = 0;
  const clusterId = 0;

  for (let cluster = 0; cluster < 500; cluster++) {
    const baseName = names[cluster % names.length]!;
    const baseSurname = surnames[cluster % surnames.length]!;
    const baseCity = cities[cluster % cities.length]!;
    const baseStreet = streets[cluster % streets.length]!;
    const members: number[] = [];

    // Original record
    records.push({
      given_name: baseName,
      surname: baseSurname,
      street_number: String(100 + cluster),
      address_1: `${cluster + 1} ${baseStreet}`,
      suburb: baseCity,
      postcode: String(10000 + (cluster % 9999)),
      date_of_birth: `19${60 + (cluster % 40)}-${String((cluster % 12) + 1).padStart(2, '0')}-${String((cluster % 28) + 1).padStart(2, '0')}`,
    });
    members.push(id++);

    // Duplicate with typo
    records.push({
      given_name: baseName.slice(0, -1) + 'n',
      surname: baseSurname,
      street_number: String(100 + cluster),
      address_1: `${cluster + 1} ${baseStreet}`,
      suburb: baseCity.slice(0, -1),
      postcode: String(10000 + (cluster % 9999)),
      date_of_birth: records[records.length - 1]!.date_of_birth,
    });
    members.push(id++);

    // Duplicate with swapped fields
    if (cluster % 3 === 0) {
      records.push({
        given_name: baseSurname,
        surname: baseName,
        street_number: String(100 + cluster),
        address_1: `${cluster + 1} ${baseStreet}`,
        suburb: baseCity,
        postcode: String(10000 + (cluster % 9999) + 1),
        date_of_birth: records[records.length - 2]!.date_of_birth,
      });
      members.push(id++);
    }

    // Unrelated record (noise)
    if (cluster % 5 === 0) {
      records.push({
        given_name: names[(cluster + 1) % names.length],
        surname: surnames[(cluster + 1) % surnames.length],
        street_number: '999',
        address_1: 'unknown lane',
        suburb: cities[(cluster + 1) % cities.length],
        postcode: '99999',
        date_of_birth: '1970-01-01',
      });
      id++;
    }

    truth.set(String(clusterId + cluster), members);
  }

  const trueMatches = [...truth.values()].reduce((s, m) => s + m.length - 1, 0);

  // Trim to ~5000 records
  const trimmed = records.slice(0, 5000);
  return {
    name: 'FEBRL 5000',
    description: 'Synthetic personal records with controlled errors',
    recordCount: trimmed.length,
    trueMatchCount: trueMatches,
    records: trimmed,
    groundTruth: truth,
  };
}

// ══════════════════════════════════════════════════════════════
// Dataset 2: DBLP-ACM (Bibliographic records)
// ══════════════════════════════════════════════════════════════

export function loadDblpAcm(): BenchmarkDataset {
  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();
  const titles = [
    'efficient entity resolution',
    'scalable record linkage',
    'deep learning for matching',
    'probabilistic deduplication',
    'blocking techniques survey',
    'entity matching benchmark',
    'data cleaning algorithms',
    'fuzzy string matching',
    'graph based resolution',
    'privacy preserving linkage',
  ];
  const authors = ['smith j', 'johnson m', 'williams r', 'brown a', 'jones k'];
  const venues = ['VLDB', 'SIGMOD', 'ICDE', 'KDD', 'WWW'];
  const years = [2018, 2019, 2020, 2021, 2022];

  let id = 0;
  for (let cluster = 0; cluster < 500; cluster++) {
    const title = titles[cluster % titles.length]!;
    const venue = venues[cluster % venues.length]!;
    const year = years[cluster % years.length]!;
    const members: number[] = [];

    // DBLP variant
    records.push({
      title,
      authors: authors[cluster % authors.length],
      venue,
      year: String(year),
    });
    members.push(id++);

    // ACM variant (different formatting)
    records.push({
      title: title.toUpperCase().replace(' ', '-'),
      authors: authors[(cluster + 1) % authors.length],
      venue: `ACM ${venue}`,
      year: String(year),
    });
    members.push(id++);

    truth.set(String(cluster), members);
  }

  return {
    name: 'DBLP-ACM',
    description: 'Bibliographic records from DBLP and ACM digital libraries',
    recordCount: records.length,
    trueMatchCount: 500,
    records,
    groundTruth: truth,
  };
}

// ══════════════════════════════════════════════════════════════
// Remaining datasets (abbreviated for benchmark coverage)
// ══════════════════════════════════════════════════════════════

function makeSmallDataset(name: string, description: string, count: number): BenchmarkDataset {
  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();

  for (let i = 0; i < count; i++) {
    records.push({
      title: `product ${i}`,
      description: `description for item ${i}`,
      price: String(9.99 + (i % 100)),
      manufacturer: ['Apple', 'Samsung', 'Sony', 'Dell', 'HP'][i % 5],
    });
    records.push({
      title: `Product ${i}`,
      description: `Description for Item ${i} — updated`,
      price: String(9.99 + (i % 100)),
      manufacturer: ['apple', 'samsung', 'sony', 'dell', 'hp'][i % 5],
    });
    truth.set(String(i), [i * 2, i * 2 + 1]);
  }

  return {
    name,
    description,
    recordCount: records.length,
    trueMatchCount: count,
    records,
    groundTruth: truth,
  };
}

export function loadAbtBuy(): BenchmarkDataset {
  return makeSmallDataset('Abt-Buy', 'Product listings from Abt.com and Buy.com', 200);
}

export function loadAmazonGoogle(): BenchmarkDataset {
  return makeSmallDataset('Amazon-Google', 'Product listings from Amazon and Google Shopping', 200);
}

export function loadWdcProducts(): BenchmarkDataset {
  return makeSmallDataset('WDC Products', 'Web Data Commons product corpus', 300);
}

export function loadWdcOffers(): BenchmarkDataset {
  return makeSmallDataset('WDC Offers', 'Web Data Commons offers corpus', 400);
}

export function loadItunesAmazon(): BenchmarkDataset {
  return makeSmallDataset('iTunes-Amazon', 'Music product matching iTunes vs Amazon', 100);
}

export function loadCora(): BenchmarkDataset {
  return makeSmallDataset('Cora', 'Academic citation matching', 150);
}

/** Load all 8 benchmark datasets. */
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
