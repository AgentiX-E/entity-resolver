// Deterministic FEBRL-style benchmark dataset generator.
// Produces realistic entity resolution datasets with known ground truth.
// Uses seeded PRNG for reproducibility — same seed = same data.

import type { RawRecord } from '../types/core.js';

/** A generated benchmark dataset with ground truth. */
export interface GeneratedDataset {
  readonly records: RawRecord[];
  readonly groundTruth: Map<string, number[]>;
  readonly trueMatchCount: number;
}

/** Configuration for the data generator. */
export interface GeneratorConfig {
  /** Number of base entities (true clusters). */
  readonly numEntities: number;
  /** Records per entity (before noise). */
  readonly recordsPerEntity: number;
  /** Number of noise/distractor records. */
  readonly noiseRecords: number;
  /** Typo probability per field. */
  readonly typoRate: number;
  /** Schema variation probability (field renames). */
  readonly schemaVarRate: number;
  /** Field swap probability. */
  readonly swapRate: number;
}

// ═══════════════════════════════════════════════════════════════
// Seeded PRNG (Mulberry32)
// ═══════════════════════════════════════════════════════════════

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max]. */
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.range(0, arr.length - 1)]!;
  }

  /** Shuffle an array (Fisher-Yates). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.range(0, i);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
}

// ═══════════════════════════════════════════════════════════════
// Name corpuses (top 100 first names, top 100 surnames by frequency)
// ═══════════════════════════════════════════════════════════════

const FIRST_NAMES = [
  'James',
  'John',
  'Robert',
  'Michael',
  'William',
  'David',
  'Richard',
  'Joseph',
  'Thomas',
  'Charles',
  'Mary',
  'Patricia',
  'Jennifer',
  'Linda',
  'Barbara',
  'Elizabeth',
  'Susan',
  'Jessica',
  'Sarah',
  'Karen',
  'Daniel',
  'Matthew',
  'Anthony',
  'Mark',
  'Donald',
  'Steven',
  'Paul',
  'Andrew',
  'Joshua',
  'Kenneth',
  'Lisa',
  'Nancy',
  'Betty',
  'Margaret',
  'Sandra',
  'Ashley',
  'Dorothy',
  'Kimberly',
  'Emily',
  'Donna',
  'Christopher',
  'George',
  'Brian',
  'Edward',
  'Ronald',
  'Timothy',
  'Jason',
  'Jeffrey',
  'Ryan',
  'Jacob',
  'Michelle',
  'Carol',
  'Amanda',
  'Melissa',
  'Deborah',
  'Stephanie',
  'Rebecca',
  'Sharon',
  'Laura',
  'Cynthia',
  'Gary',
  'Nicholas',
  'Eric',
  'Jonathan',
  'Stephen',
  'Larry',
  'Justin',
  'Scott',
  'Brandon',
  'Benjamin',
  'Kathleen',
  'Amy',
  'Shirley',
  'Anna',
  'Angela',
  'Ruth',
  'Brenda',
  'Pamela',
  'Nicole',
  'Katherine',
  'Samuel',
  'Gregory',
  'Frank',
  'Alexander',
  'Raymond',
  'Patrick',
  'Jack',
  'Dennis',
  'Jerry',
  'Tyler',
  'Samantha',
  'Christine',
  'Emma',
  'Helen',
  'Debra',
  'Rachel',
  'Carolyn',
  'Janet',
  'Maria',
  'Catherine',
];

const SURNAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
  'Lee',
  'Perez',
  'Thompson',
  'White',
  'Harris',
  'Sanchez',
  'Clark',
  'Ramirez',
  'Lewis',
  'Robinson',
  'Walker',
  'Young',
  'Allen',
  'King',
  'Wright',
  'Scott',
  'Torres',
  'Nguyen',
  'Hill',
  'Flores',
  'Green',
  'Adams',
  'Nelson',
  'Baker',
  'Hall',
  'Rivera',
  'Campbell',
  'Mitchell',
  'Carter',
  'Roberts',
  'Gomez',
  'Phillips',
  'Evans',
  'Turner',
  'Diaz',
  'Parker',
  'Cruz',
  'Edwards',
  'Collins',
  'Reyes',
  'Stewart',
  'Morris',
  'Morales',
  'Murphy',
  'Cook',
  'Rogers',
  'Gutierrez',
  'Ortiz',
  'Morgan',
  'Cooper',
  'Peterson',
  'Bailey',
  'Reed',
  'Kelly',
  'Howard',
  'Ramos',
  'Kim',
  'Cox',
  'Ward',
  'Richardson',
  'Watson',
  'Brooks',
  'Chavez',
  'Wood',
  'James',
  'Bennett',
  'Gray',
  'Mendoza',
  'Ruiz',
  'Hughes',
  'Price',
  'Alvarez',
  'Castillo',
  'Sanders',
  'Patel',
  'Myers',
  'Long',
  'Ross',
  'Foster',
  'Jimenez',
];

const CITIES = [
  'New York',
  'Los Angeles',
  'Chicago',
  'Houston',
  'Phoenix',
  'Philadelphia',
  'San Antonio',
  'San Diego',
  'Dallas',
  'San Jose',
  'Austin',
  'Jacksonville',
  'Fort Worth',
  'Columbus',
  'Charlotte',
  'Indianapolis',
  'San Francisco',
  'Seattle',
  'Denver',
  'Washington',
];

const STREETS = [
  'Main St',
  'Oak Ave',
  'Elm St',
  'Maple Dr',
  'Cedar Ln',
  'Pine Rd',
  'Birch Ct',
  'Lake View',
  'Hillcrest Dr',
  'Park Ave',
  'River Rd',
  'Forest Ln',
  'Meadow Way',
  'Valley Dr',
  'Sunset Blvd',
];

const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me'];

// ═══════════════════════════════════════════════════════════════
// Error generators — realistic transformations
// ═══════════════════════════════════════════════════════════════

const TYPO_MAP: Record<string, string[]> = {
  a: ['s', 'q', 'w'],
  b: ['v', 'n', 'g'],
  c: ['x', 'v', 'd'],
  d: ['s', 'f', 'c'],
  e: ['w', 'r', 'd'],
  f: ['d', 'g', 'r'],
  g: ['f', 'h', 't'],
  h: ['g', 'j', 'y'],
  i: ['u', 'o', 'k'],
  j: ['h', 'k', 'u'],
  k: ['j', 'l', 'i'],
  l: ['k', 'p', 'o'],
  m: ['n', 'j', 'k'],
  n: ['b', 'm', 'h'],
  o: ['i', 'p', 'l'],
  p: ['o', 'l'],
  q: ['w', 'a'],
  r: ['e', 't', 'f'],
  s: ['a', 'w', 'd'],
  t: ['r', 'y', 'g'],
  u: ['y', 'i', 'j'],
  v: ['c', 'b', 'f'],
  w: ['q', 'e', 's'],
  x: ['z', 's', 'c'],
  y: ['t', 'u', 'h'],
  z: ['a', 'x', 's'],
};

function mutateTypo(s: string, rng: SeededRNG): string {
  if (s.length < 3) return s;
  const chars = s.split('');
  const pos = rng.range(0, chars.length - 1);
  const c = chars[pos]!.toLowerCase();
  const subs = TYPO_MAP[c] ?? [c];
  chars[pos] = rng.pick(subs);
  return chars.join('');
}

function mutateInsert(s: string, rng: SeededRNG): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const pos = rng.range(0, s.length);
  return s.slice(0, pos) + rng.pick(chars.split('')) + s.slice(pos);
}

function mutateDelete(s: string, rng: SeededRNG): string {
  if (s.length <= 2) return s;
  const pos = rng.range(0, s.length - 1);
  return s.slice(0, pos) + s.slice(pos + 1);
}

function mutateTranspose(s: string, rng: SeededRNG): string {
  if (s.length < 3) return s;
  const pos = rng.range(0, s.length - 2);
  const chars = s.split('');
  const tmp = chars[pos]!;
  chars[pos] = chars[pos + 1]!;
  chars[pos + 1] = tmp;
  return chars.join('');
}

/** Apply one random typo transformation. */
function applyTypo(s: string, rng: SeededRNG): string {
  const op = rng.next();
  if (op < 0.4) return mutateTypo(s, rng); // substitution
  if (op < 0.65) return mutateTranspose(s, rng); // transpose
  if (op < 0.85) return mutateInsert(s, rng); // insertion
  return mutateDelete(s, rng); // deletion
}

/** Generate a phonetic variation (common misspelling). */
function phoneticVariant(s: string, rng: SeededRNG): string {
  const phoneticMap: Record<string, string> = {
    ph: 'f',
    ck: 'k',
    gh: 'f',
    wr: 'r',
  };
  let result = s.toLowerCase();
  for (const [pattern, replacement] of Object.entries(phoneticMap)) {
    if (result.includes(pattern) && rng.next() < 0.5) {
      result = result.replace(pattern, replacement);
    }
  }
  // Random double-letter removal
  const chars = result.split('');
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i] === chars[i + 1] && rng.next() < 0.3) {
      chars.splice(i, 1);
      break;
    }
  }
  return chars.join('');
}

// ═══════════════════════════════════════════════════════════════
// Record generators
// ═══════════════════════════════════════════════════════════════

interface PersonEntity {
  firstName: string;
  lastName: string;
  dob: string; // ISO date
  city: string;
  street: string;
  email: string;
}

function generatePersonEntity(rng: SeededRNG, id: number): PersonEntity {
  const fn = rng.pick(FIRST_NAMES);
  const ln = rng.pick(SURNAMES);
  const year = rng.range(1950, 2010);
  const month = String(rng.range(1, 12)).padStart(2, '0');
  const day = String(rng.range(1, 28)).padStart(2, '0');
  const city = rng.pick(CITIES);
  const num = rng.range(100, 9999);
  const street = `${num} ${rng.pick(STREETS)}`;
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${id}@${rng.pick(DOMAINS)}`;
  return {
    firstName: fn,
    lastName: ln,
    dob: `${year}-${month}-${day}`,
    city,
    street,
    email,
  };
}

function generatePersonVariant(
  entity: PersonEntity,
  rng: SeededRNG,
  _variantNum: number,
): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    given_name: entity.firstName,
    surname: entity.lastName,
    date_of_birth: entity.dob,
    address_city: entity.city,
    address_street: entity.street,
    email: entity.email,
  };

  // Apply typo to one field
  if (rng.next() < 0.5) {
    const field = rng.pick(['given_name', 'surname', 'address_city']);
    const entityValue: string =
      field === 'given_name'
        ? entity.firstName
        : field === 'surname'
          ? entity.lastName
          : entity.city;
    rec[field] = applyTypo(entityValue, rng);
  }

  // Phonetic variation
  if (rng.next() < 0.2) {
    rec.surname = phoneticVariant(entity.lastName, rng);
  }

  // Date format variation
  if (rng.next() < 0.15) {
    const [y, m, d] = entity.dob.split('-');
    rec.date_of_birth = `${m}/${d}/${y}`;
  }

  // Schema variation (field rename)
  if (rng.next() < 0.1) {
    delete rec.address_city;
    rec.city = entity.city;
  }

  return rec;
}

// ═══════════════════════════════════════════════════════════════
// Product dataset generators
// ═══════════════════════════════════════════════════════════════

interface ProductEntity {
  name: string;
  brand: string;
  category: string;
  price: number;
  weight: number;
  screen: number;
  ram: number;
  storage: number;
}

const PHONE_PRODUCTS: ProductEntity[] = [
  {
    name: 'iPhone 15 Pro Max',
    brand: 'Apple',
    category: 'Smartphone',
    price: 1199,
    weight: 0.221,
    screen: 6.7,
    ram: 8,
    storage: 256,
  },
  {
    name: 'Galaxy S24 Ultra',
    brand: 'Samsung',
    category: 'Smartphone',
    price: 1299,
    weight: 0.232,
    screen: 6.8,
    ram: 12,
    storage: 512,
  },
  {
    name: 'Pixel 8 Pro',
    brand: 'Google',
    category: 'Smartphone',
    price: 999,
    weight: 0.213,
    screen: 6.7,
    ram: 12,
    storage: 128,
  },
  {
    name: 'OnePlus 12',
    brand: 'OnePlus',
    category: 'Smartphone',
    price: 799,
    weight: 0.22,
    screen: 6.82,
    ram: 16,
    storage: 256,
  },
  {
    name: 'Xiaomi 14 Pro',
    brand: 'Xiaomi',
    category: 'Smartphone',
    price: 699,
    weight: 0.223,
    screen: 6.73,
    ram: 12,
    storage: 512,
  },
  {
    name: 'Xperia 1 V',
    brand: 'Sony',
    category: 'Smartphone',
    price: 1399,
    weight: 0.187,
    screen: 6.5,
    ram: 12,
    storage: 256,
  },
  {
    name: 'Nothing Phone 2',
    brand: 'Nothing',
    category: 'Smartphone',
    price: 599,
    weight: 0.201,
    screen: 6.7,
    ram: 12,
    storage: 256,
  },
  {
    name: 'Mate 60 Pro',
    brand: 'Huawei',
    category: 'Smartphone',
    price: 899,
    weight: 0.225,
    screen: 6.82,
    ram: 12,
    storage: 512,
  },
  {
    name: 'Find X7 Ultra',
    brand: 'Oppo',
    category: 'Smartphone',
    price: 849,
    weight: 0.221,
    screen: 6.82,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Magic V2',
    brand: 'Honor',
    category: 'Smartphone',
    price: 1099,
    weight: 0.231,
    screen: 7.92,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Zenfone 10',
    brand: 'Asus',
    category: 'Smartphone',
    price: 699,
    weight: 0.172,
    screen: 5.9,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Edge 40 Pro',
    brand: 'Motorola',
    category: 'Smartphone',
    price: 799,
    weight: 0.199,
    screen: 6.67,
    ram: 12,
    storage: 256,
  },
  {
    name: 'Aquos R8 Pro',
    brand: 'Sharp',
    category: 'Smartphone',
    price: 849,
    weight: 0.195,
    screen: 6.6,
    ram: 12,
    storage: 256,
  },
  {
    name: 'Galaxy Z Fold 5',
    brand: 'Samsung',
    category: 'Smartphone',
    price: 1799,
    weight: 0.253,
    screen: 7.6,
    ram: 12,
    storage: 512,
  },
  {
    name: 'ROG Phone 8',
    brand: 'Asus',
    category: 'Smartphone',
    price: 1099,
    weight: 0.225,
    screen: 6.78,
    ram: 16,
    storage: 256,
  },
  {
    name: 'Redmi Note 13 Pro',
    brand: 'Xiaomi',
    category: 'Smartphone',
    price: 399,
    weight: 0.187,
    screen: 6.67,
    ram: 8,
    storage: 256,
  },
  {
    name: 'Realme GT 5 Pro',
    brand: 'Realme',
    category: 'Smartphone',
    price: 549,
    weight: 0.218,
    screen: 6.78,
    ram: 16,
    storage: 256,
  },
  {
    name: 'Vivo X100 Pro',
    brand: 'Vivo',
    category: 'Smartphone',
    price: 749,
    weight: 0.221,
    screen: 6.78,
    ram: 16,
    storage: 512,
  },
  {
    name: 'iPhone 15',
    brand: 'Apple',
    category: 'Smartphone',
    price: 799,
    weight: 0.171,
    screen: 6.1,
    ram: 6,
    storage: 128,
  },
  {
    name: 'Pixel 8',
    brand: 'Google',
    category: 'Smartphone',
    price: 699,
    weight: 0.187,
    screen: 6.2,
    ram: 8,
    storage: 128,
  },
];

const COMPUTER_PRODUCTS: ProductEntity[] = [
  {
    name: 'ThinkPad X1 Carbon',
    brand: 'Lenovo',
    category: 'Laptop',
    price: 1649,
    weight: 1.13,
    screen: 14,
    ram: 16,
    storage: 512,
  },
  {
    name: 'MacBook Pro 16 M3',
    brand: 'Apple',
    category: 'Laptop',
    price: 2499,
    weight: 2.14,
    screen: 16.2,
    ram: 18,
    storage: 512,
  },
  {
    name: 'XPS 15',
    brand: 'Dell',
    category: 'Laptop',
    price: 1499,
    weight: 1.86,
    screen: 15.6,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Spectre x360',
    brand: 'HP',
    category: 'Laptop',
    price: 1449,
    weight: 1.36,
    screen: 13.5,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Surface Laptop 6',
    brand: 'Microsoft',
    category: 'Laptop',
    price: 1299,
    weight: 1.54,
    screen: 15,
    ram: 16,
    storage: 256,
  },
  {
    name: 'Zenbook Pro 14',
    brand: 'Asus',
    category: 'Laptop',
    price: 1799,
    weight: 1.65,
    screen: 14.5,
    ram: 32,
    storage: 1024,
  },
  {
    name: 'Galaxy Book4 Ultra',
    brand: 'Samsung',
    category: 'Laptop',
    price: 2399,
    weight: 1.86,
    screen: 16,
    ram: 32,
    storage: 1024,
  },
  {
    name: 'Swift Go 14',
    brand: 'Acer',
    category: 'Laptop',
    price: 799,
    weight: 1.25,
    screen: 14,
    ram: 8,
    storage: 512,
  },
  {
    name: 'IdeaPad Slim 7',
    brand: 'Lenovo',
    category: 'Laptop',
    price: 1049,
    weight: 1.43,
    screen: 16,
    ram: 16,
    storage: 512,
  },
  {
    name: 'MacBook Air 15 M3',
    brand: 'Apple',
    category: 'Laptop',
    price: 1299,
    weight: 1.51,
    screen: 15.3,
    ram: 8,
    storage: 256,
  },
  {
    name: 'ROG Zephyrus G16',
    brand: 'Asus',
    category: 'Laptop',
    price: 1999,
    weight: 1.85,
    screen: 16,
    ram: 32,
    storage: 1024,
  },
  {
    name: 'Razer Blade 16',
    brand: 'Razer',
    category: 'Laptop',
    price: 2999,
    weight: 2.45,
    screen: 16,
    ram: 32,
    storage: 1024,
  },
  {
    name: 'EliteBook 840 G10',
    brand: 'HP',
    category: 'Laptop',
    price: 1399,
    weight: 1.36,
    screen: 14,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Latitude 7440',
    brand: 'Dell',
    category: 'Laptop',
    price: 1599,
    weight: 1.13,
    screen: 14,
    ram: 16,
    storage: 256,
  },
  {
    name: 'ThinkBook 16p Gen 4',
    brand: 'Lenovo',
    category: 'Laptop',
    price: 1899,
    weight: 2.2,
    screen: 16,
    ram: 32,
    storage: 1024,
  },
  {
    name: 'Yoga Pro 9i',
    brand: 'Lenovo',
    category: 'Laptop',
    price: 1699,
    weight: 2.18,
    screen: 16,
    ram: 32,
    storage: 1024,
  },
  {
    name: 'Blade 14',
    brand: 'Razer',
    category: 'Laptop',
    price: 2399,
    weight: 1.84,
    screen: 14,
    ram: 16,
    storage: 1024,
  },
  {
    name: 'Gram 17',
    brand: 'LG',
    category: 'Laptop',
    price: 1599,
    weight: 1.35,
    screen: 17,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Prestige 14 Evo',
    brand: 'MSI',
    category: 'Laptop',
    price: 1099,
    weight: 1.29,
    screen: 14,
    ram: 16,
    storage: 512,
  },
  {
    name: 'Framework Laptop 13',
    brand: 'Framework',
    category: 'Laptop',
    price: 1049,
    weight: 1.3,
    screen: 13.5,
    ram: 16,
    storage: 256,
  },
];

function generateProductVariant(
  entity: ProductEntity,
  rng: SeededRNG,
  variantIndex: number,
): Record<string, unknown> {
  const rec: Record<string, unknown> = {
    name: entity.name,
    manufacturer: entity.brand,
    category: entity.category,
    price: entity.price,
  };

  // Variant-specific modifications
  if (variantIndex === 1) {
    // Store 2 — title case changes, price rounding
    rec.name = entity.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    rec.price = Math.round(entity.price * 1.05 * 100) / 100;
    rec.manufacturer = entity.brand.toLowerCase();
  }
  if (variantIndex === 2) {
    rec.name = `NEW: ${entity.name}`;
    rec.price = entity.price * 0.95;
  }

  // Typo in name
  if (rng.next() < 0.15) {
    rec.name = applyTypo(entity.name, rng);
  }

  return rec;
}

// ═══════════════════════════════════════════════════════════════
// Public API — dataset generation
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a FEBRL-style person dataset.
 *
 * Parameters:
 * - numEntities: number of unique people (true clusters) — default 1000
 * - recordsPerEntity: how many duplicate/variant records per person — default 2
 * - noiseRecords: unlinked noise records — default 200
 * - typoRate: probability of typo per duplicate — default 0.5
 *
 * Returns at least 1000 records with realistic error patterns:
 * typos, phonetic variants, date format differences, schema variations.
 */
export function generateFebrlDataset(config?: Partial<GeneratorConfig>): GeneratedDataset {
  const defaults: GeneratorConfig = {
    numEntities: 1000,
    recordsPerEntity: 2,
    noiseRecords: 200,
    typoRate: 0.5,
    schemaVarRate: 0.1,
    swapRate: 0.05,
  };
  const cfg = { ...defaults, ...config };
  const rng = new SeededRNG(42); // Deterministic

  const records: RawRecord[] = [];
  const groundTruth = new Map<string, number[]>();
  let trueMatchCount = 0;

  for (let i = 0; i < cfg.numEntities; i++) {
    const entity = generatePersonEntity(rng, i);
    const clusterId = `entity_${i}`;
    const members: number[] = [];

    // Master record
    const idx = records.length;
    records.push({
      given_name: entity.firstName,
      surname: entity.lastName,
      date_of_birth: entity.dob,
      address_city: entity.city,
      address_street: entity.street,
      email: entity.email,
    });
    members.push(idx);

    // Duplicate records with errors
    for (let v = 0; v < cfg.recordsPerEntity - 1; v++) {
      const dupIdx = records.length;
      const variant = generatePersonVariant(entity, rng, v);
      records.push(variant);
      members.push(dupIdx);
      trueMatchCount++;
    }

    groundTruth.set(clusterId, members);
  }

  // Noise records (no duplicates, no ground truth cluster)
  for (let n = 0; n < cfg.noiseRecords; n++) {
    const entity = generatePersonEntity(rng, cfg.numEntities + n);
    records.push({
      given_name: entity.firstName,
      surname: entity.lastName,
      date_of_birth: entity.dob,
      address_city: entity.city,
      address_street: entity.street,
      email: entity.email,
    });
  }

  return { records, groundTruth, trueMatchCount };
}

/**
 * Generate a product matching dataset (Abt-Buy style).
 *
 * Builds records from two different stores with schema variations,
 * price differences, and title formatting differences.
 */
export function generateAbtBuyDataset(config?: Partial<GeneratorConfig>): GeneratedDataset {
  const defaults: GeneratorConfig = {
    numEntities: 20,
    recordsPerEntity: 3,
    noiseRecords: 10,
    typoRate: 0.2,
    schemaVarRate: 0.3,
    swapRate: 0.05,
  };
  const cfg = { ...defaults, ...config };
  const rng = new SeededRNG(12345);

  const records: RawRecord[] = [];
  const groundTruth = new Map<string, number[]>();
  let trueMatchCount = 0;

  const products = [...PHONE_PRODUCTS, ...COMPUTER_PRODUCTS];
  const selected = rng.shuffle([...products]).slice(0, cfg.numEntities);

  const sources = ['abt.com', 'buy.com', 'newegg.com'];

  for (let i = 0; i < selected.length; i++) {
    const prod = selected[i]!;
    const clusterId = `product_${i}`;
    const members: number[] = [];

    for (let s = 0; s < cfg.recordsPerEntity; s++) {
      const idx = records.length;
      const variant = generateProductVariant(prod, rng, s);
      variant.source = sources[s % sources.length];
      records.push(variant);
      members.push(idx);
      if (s > 0) trueMatchCount++;
    }

    groundTruth.set(clusterId, members);
  }

  // Noise products
  for (let n = 0; n < cfg.noiseRecords; n++) {
    const prod = rng.pick(products);
    const variant = generateProductVariant(prod, rng, rng.range(0, 2));
    variant.source = rng.pick(sources);
    variant.name = `${rng.pick(['Refurbished', 'Open Box', 'Clearance'])}: ${variant.name}`;
    records.push(variant);
  }

  return { records, groundTruth, trueMatchCount };
}

/**
 * Generate an Amazon-Google style cross-retailer product dataset.
 */
export function generateAmazonGoogleDataset(config?: Partial<GeneratorConfig>): GeneratedDataset {
  const cfg: GeneratorConfig = {
    numEntities: 20,
    recordsPerEntity: 2,
    noiseRecords: 5,
    typoRate: 0.3,
    schemaVarRate: 0.1,
    swapRate: 0.05,
    ...config,
  };
  const rng = new SeededRNG(54321);

  const records: RawRecord[] = [];
  const groundTruth = new Map<string, number[]>();
  let trueMatchCount = 0;

  const allProducts = [...PHONE_PRODUCTS, ...COMPUTER_PRODUCTS];
  const selected = rng.shuffle([...allProducts]).slice(0, cfg.numEntities);

  for (let i = 0; i < selected.length; i++) {
    const prod = selected[i]!;
    const clusterId = `item_${i}`;
    const members: number[] = [];

    // Amazon listing
    const aIdx = records.length;
    records.push({
      title: prod.name,
      description: `${prod.brand} ${prod.category} — ${prod.ram}GB RAM, ${prod.storage}GB storage`,
      manufacturer: prod.brand,
      price: prod.price.toFixed(2),
    });
    members.push(aIdx);

    // Google listing
    const gIdx = records.length;
    records.push({
      title: prod.name.toLowerCase(),
      description: `${prod.category} by ${prod.brand}. Memory: ${prod.ram}GB. Storage: ${prod.storage}GB.`,
      manufacturer: prod.brand.toLowerCase(),
      price: (prod.price * (0.95 + rng.next() * 0.1)).toFixed(2),
    });
    members.push(gIdx);
    trueMatchCount++;

    groundTruth.set(clusterId, members);
  }

  // Noise
  for (let n = 0; n < cfg.noiseRecords; n++) {
    const prod = rng.pick(allProducts);
    records.push({
      title: `${rng.pick(['Generic', 'Compatible', 'Replacement'])} ${prod.category}`,
      description: `Third-party accessory`,
      manufacturer: 'Generic',
      price: (rng.next() * 50).toFixed(2),
    });
  }

  return { records, groundTruth, trueMatchCount };
}

/**
 * Generate a Cora-style academic citation dataset.
 */
export function generateCoraDataset(config?: Partial<GeneratorConfig>): GeneratedDataset {
  const cfg: GeneratorConfig = {
    numEntities: 20,
    recordsPerEntity: 2,
    noiseRecords: 5,
    typoRate: 0.2,
    schemaVarRate: 0.1,
    swapRate: 0.05,
    ...config,
  };
  const rng = new SeededRNG(9999);

  const venues = [
    'SIGMOD',
    'VLDB',
    'ICDE',
    'KDD',
    'WWW',
    'SIGIR',
    'CIKM',
    'ICML',
    'NeurIPS',
    'CVPR',
    'ACL',
    'EMNLP',
    'NAACL',
    'COLING',
    'AAAI',
    'IJCAI',
    'UAI',
    'COLT',
    'ICLR',
    'ECML',
  ];

  const records: RawRecord[] = [];
  const groundTruth = new Map<string, number[]>();
  let trueMatchCount = 0;

  for (let i = 0; i < cfg.numEntities; i++) {
    const title = generatePaperTitle(rng, i);
    const authors = generateAuthorList(rng);
    const venue = rng.pick(venues);
    const year = rng.range(2018, 2025);
    const clusterId = `paper_${i}`;
    const members: number[] = [];

    // Primary source
    const pIdx = records.length;
    records.push({ title, authors, venue, year });
    members.push(pIdx);

    // Secondary source with variations
    const sIdx = records.length;
    records.push({
      title: mutatePaperTitle(title, rng),
      authors: authors
        .split(',')
        .map((a) => a.trim().split(' ').reverse().join(', '))
        .join('; '),
      venue: venue.toLowerCase(),
      year,
    });
    members.push(sIdx);
    trueMatchCount++;

    groundTruth.set(clusterId, members);
  }

  // Noise
  for (let n = 0; n < cfg.noiseRecords; n++) {
    records.push({
      title: generatePaperTitle(rng, cfg.numEntities + n),
      authors: generateAuthorList(rng),
      venue: rng.pick(venues),
      year: rng.range(2015, 2025),
    });
  }

  return { records, groundTruth, trueMatchCount };
}

// ═══════════════════════════════════════════════════════════════
// Helpers for paper generation
// ═══════════════════════════════════════════════════════════════

const PAPER_PREFIXES = [
  'Efficient',
  'Scalable',
  'Robust',
  'Adaptive',
  'Distributed',
  'Deep',
  'Towards',
  'A Study of',
  'On the',
  'Probabilistic',
  'Learning',
  'Fast',
  'Accurate',
  'Unsupervised',
  'End-to-End',
];

const PAPER_SUBJECTS = [
  'Entity Resolution',
  'Record Linkage',
  'Data Matching',
  'Deduplication',
  'Knowledge Graph',
  'Schema Matching',
  'Data Integration',
  'Information Extraction',
  'Named Entity Recognition',
  'Text Classification',
  'Sentiment Analysis',
  'Graph Neural Networks',
  'Transformer Architecture',
  'Attention Mechanisms',
  'Representation Learning',
  'Few-Shot Learning',
  'Transfer Learning',
];

function generatePaperTitle(rng: SeededRNG, seed: number): string {
  const r = new SeededRNG(seed * 7 + 13);
  const prefix = rng.pick(PAPER_PREFIXES);
  const subject = r.pick(PAPER_SUBJECTS);
  return `${prefix} ${subject}`;
}

function mutatePaperTitle(title: string, rng: SeededRNG): string {
  const parts = title.split(' ');
  if (parts.length >= 3 && rng.next() < 0.3) {
    // Swap words
    const i = rng.range(0, parts.length - 1);
    const tmp = parts[i]!;
    parts[i] = parts[i + 1]!;
    parts[i + 1] = tmp;
  }
  if (rng.next() < 0.3) {
    // Lowercase
    return parts.join(' ').toLowerCase();
  }
  return parts.join(' ');
}

function generateAuthorList(rng: SeededRNG): string {
  const count = rng.range(1, 5);
  const authors: string[] = [];
  for (let i = 0; i < count; i++) {
    const fn = rng.pick(FIRST_NAMES);
    const ln = rng.pick(SURNAMES);
    authors.push(`${fn} ${ln}`);
  }
  return authors.join(', ');
}
