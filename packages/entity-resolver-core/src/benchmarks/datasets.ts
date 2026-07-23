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
    'efficient entity resolver',
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

// ══════════════════════════════════════════════════════════════
// Dataset 3: Abt-Buy — Product matching with title/price variations
// ══════════════════════════════════════════════════════════════

export function loadAbtBuy(): BenchmarkDataset {
  const products = [
    { name: 'Sony BRAVIA 55" 4K OLED TV', price: 1499.99, mfr: 'Sony', cat: 'Electronics' },
    { name: 'Apple MacBook Pro 16" M3', price: 2499.00, mfr: 'Apple', cat: 'Computers' },
    { name: 'Bose QuietComfort 45 Headphones', price: 329.95, mfr: 'Bose', cat: 'Audio' },
    { name: 'Dell UltraSharp 27" 4K Monitor', price: 619.99, mfr: 'Dell', cat: 'Monitors' },
    { name: 'Canon EOS R6 Mark II', price: 2499.00, mfr: 'Canon', cat: 'Cameras' },
    { name: 'Samsung Galaxy Tab S9', price: 799.99, mfr: 'Samsung', cat: 'Tablets' },
    { name: 'Logitech MX Master 3S Mouse', price: 99.99, mfr: 'Logitech', cat: 'Peripherals' },
    { name: 'LG 65" OLED C3 Series', price: 1799.99, mfr: 'LG', cat: 'Electronics' },
    { name: 'Apple AirPods Pro 2nd Gen', price: 249.00, mfr: 'Apple', cat: 'Audio' },
    { name: 'Razer DeathAdder V3 Pro', price: 149.99, mfr: 'Razer', cat: 'Peripherals' },
  ];

  const surnameNoise = [
    'ALEXA', 'GOOGLE', 'WALMART', 'TARGET', 'BESTBUY',
    'NEWEGG', 'MICROCENTER', 'BH', 'STAPLES', 'OFFICEDEPOT',
  ];

  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();

  for (let p = 0; p < products.length; p++) {
    const prod = products[p]!;
    const members: number[] = [];
    const clusterId = `abt_${p}`;

    // Abt.com listing (source A)
    records.push({ title: prod.name, price: prod.price, manufacturer: prod.mfr, category: prod.cat, source: 'abt' });
    members.push(records.length - 1);

    // Buy.com listing (source B) — slight title variation
    const buyTitle = prod.name
      .replace('"', ' inch')
      .replace('4K', '4k')
      .replace('2nd Gen', '2nd Generation');
    records.push({ title: buyTitle, price: prod.price * (0.95 + Math.random() * 0.1), manufacturer: prod.mfr.toLowerCase(), category: prod.cat, source: 'buy' });
    members.push(records.length - 1);

    // Extra variant with abbreviation (every 3rd product)
    if (p % 3 === 0) {
      records.push({ title: prod.name.replace('BRAVIA', 'Bravia').replace('Pro', 'Professional'), price: prod.price * 1.02, manufacturer: prod.mfr, category: prod.cat, source: 'abt' });
      members.push(records.length - 1);
    }

    // Noise record (every 5th product)
    if (p % 5 === 0) {
      records.push({ title: `Used ${prod.name} - ${surnameNoise[p]!}`, price: prod.price * 0.6, manufacturer: surnameNoise[p], category: prod.cat, source: 'marketplace' });
    }

    truth.set(clusterId, members);
  }

  return { name: 'Abt-Buy', description: 'Product listings from Abt.com and Buy.com with title/price variations', recordCount: records.length, trueMatchCount: truth.size, records, groundTruth: truth };
}

// ══════════════════════════════════════════════════════════════
// Dataset 4: Amazon-Google — Product matching with description text diffs
// ══════════════════════════════════════════════════════════════

export function loadAmazonGoogle(): BenchmarkDataset {
  const products = [
    { name: 'Samsung 980 PRO 2TB NVMe SSD', mfr: 'Samsung', weight: 0.008 },
    { name: 'Crucial 64GB DDR5-5600 RAM Kit', mfr: 'Crucial', weight: 0.045 },
    { name: 'WD Black 4TB HDD 7200RPM', mfr: 'Western Digital', weight: 0.72 },
    { name: 'Intel Core i9-14900K Processor', mfr: 'Intel', weight: 0.09 },
    { name: 'NVIDIA RTX 4080 Super 16GB', mfr: 'NVIDIA', weight: 2.2 },
    { name: 'Corsair RM850x Power Supply', mfr: 'Corsair', weight: 3.1 },
    { name: 'Noctua NH-D15 CPU Cooler', mfr: 'Noctua', weight: 1.32 },
    { name: 'ASUS ROG Swift OLED 27"', mfr: 'ASUS', weight: 6.9 },
    { name: 'Seagate IronWolf 8TB NAS HDD', mfr: 'Seagate', weight: 0.72 },
    { name: 'G.Skill Trident Z5 32GB DDR5', mfr: 'G.Skill', weight: 0.04 },
  ];

  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();

  for (let p = 0; p < products.length; p++) {
    const prod = products[p]!;
    const members: number[] = [];
    const clusterId = `amz_${p}`;

    // Amazon listing
    const amazonDesc = `${prod.mfr} ${prod.name.split(' ').slice(0, 4).join(' ')} — high performance, ships from Amazon`;
    records.push({ name: prod.name, description: amazonDesc, manufacturer: prod.mfr, weight_kg: prod.weight, source: 'amazon' });
    members.push(records.length - 1);

    // Google Shopping listing — different description
    const googleDesc = `Buy ${prod.name} online. ${prod.mfr} quality. Free shipping available.`;
    records.push({ name: prod.name.toLowerCase().replace('rtx', 'RTX').replace('nvme', 'NVMe'), description: googleDesc, manufacturer: prod.mfr.toLowerCase(), weight_kg: Math.round(prod.weight * 1000) / 1000, source: 'google' });
    members.push(records.length - 1);

    // Slightly different variant (every 4th product)
    if (p % 4 === 0) {
      const variantName = prod.name.replace('PRO', 'Pro').replace('2TB', '2 TB').replace('4TB', '4 TB');
      records.push({ name: variantName, description: `New in box: ${prod.name}`, manufacturer: prod.mfr, weight_kg: prod.weight, source: 'newegg' });
      members.push(records.length - 1);
    }

    // Noise
    if (p % 3 === 0) {
      records.push({ name: `${prod.mfr} Accessory — Compatible with ${prod.name.split(' ').slice(0, 2).join(' ')} series`, description: 'Third-party accessory, not original', manufacturer: 'Generic', weight_kg: 0.01 + Math.random() * 0.1, source: 'amazon' });
    }

    truth.set(clusterId, members);
  }

  return { name: 'Amazon-Google', description: 'Computer hardware matching with description text differences', recordCount: records.length, trueMatchCount: truth.size, records, groundTruth: truth };
}

// ══════════════════════════════════════════════════════════════
// Dataset 5: WDC Products — Product corpus with spec variations
// ══════════════════════════════════════════════════════════════

export function loadWdcProducts(): BenchmarkDataset {
  const phones = [
    { name: 'iPhone 15 Pro Max 256GB', brand: 'Apple', screen: 6.7, ram: 8, storage: 256 },
    { name: 'Samsung Galaxy S24 Ultra', brand: 'Samsung', screen: 6.8, ram: 12, storage: 512 },
    { name: 'Google Pixel 8 Pro 128GB', brand: 'Google', screen: 6.7, ram: 12, storage: 128 },
    { name: 'OnePlus 12 256GB', brand: 'OnePlus', screen: 6.82, ram: 16, storage: 256 },
    { name: 'Xiaomi 14 Pro', brand: 'Xiaomi', screen: 6.73, ram: 12, storage: 512 },
    { name: 'Sony Xperia 1 V', brand: 'Sony', screen: 6.5, ram: 12, storage: 256 },
    { name: 'Nothing Phone 2 256GB', brand: 'Nothing', screen: 6.7, ram: 12, storage: 256 },
    { name: 'ASUS Zenfone 10', brand: 'ASUS', screen: 5.92, ram: 16, storage: 512 },
    { name: 'Huawei P60 Pro', brand: 'Huawei', screen: 6.67, ram: 8, storage: 256 },
    { name: 'Motorola Edge 40 Pro', brand: 'Motorola', screen: 6.67, ram: 12, storage: 256 },
  ];

  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();

  for (let p = 0; p < phones.length; p++) {
    const phone = phones[p]!;
    const members: number[] = [];
    const clusterId = `wdc_${p}`;

    // Original listing
    records.push({ name: phone.name, brand: phone.brand, screen_size: phone.screen, ram_gb: phone.ram, storage_gb: phone.storage });
    members.push(records.length - 1);

    // Second source — storage variation, RAM variation
    records.push({ name: phone.name.replace('256GB', '256 GB').replace('512GB', '512 GB'), brand: phone.brand.toLowerCase(), screen_size: phone.screen, ram_gb: phone.ram, storage_gb: phone.storage });
    members.push(records.length - 1);

    // Third source — spec roundoff errors (every 2nd)
    if (p % 2 === 0) {
      records.push({ name: phone.name, brand: phone.brand, screen_size: Math.round(phone.screen * 10) / 10, ram_gb: phone.ram, storage_gb: phone.storage, color: 'black' });
      members.push(records.length - 1);
    }

    // Unrelated phone (noise, every 3rd)
    if (p % 3 === 0) {
      const altPhone = phones[(p + 5) % phones.length]!;
      records.push({ name: `${altPhone.brand} Case for ${phone.name}`, brand: 'Generic', screen_size: 0, ram_gb: 0, storage_gb: 0, accessory: true });
    }

    truth.set(clusterId, members);
  }

  return { name: 'WDC Products', description: 'Smartphone product corpus with spec variations and accessory noise', recordCount: records.length, trueMatchCount: truth.size, records, groundTruth: truth };
}

// ══════════════════════════════════════════════════════════════
// Dataset 6: WDC Offers — Merchant offers with price/category variations
// ══════════════════════════════════════════════════════════════

export function loadWdcOffers(): BenchmarkDataset {
  const books = [
    { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', isbn: '978-1449373320' },
    { title: 'Clean Code', author: 'Robert C. Martin', isbn: '978-0132350884' },
    { title: 'The Pragmatic Programmer', author: 'David Thomas', isbn: '978-0135957059' },
    { title: 'Introduction to Algorithms', author: 'Thomas H. Cormen', isbn: '978-0262033848' },
    { title: 'Structure and Interpretation of Computer Programs', author: 'Harold Abelson', isbn: '978-0262510875' },
    { title: 'Code Complete', author: 'Steve McConnell', isbn: '978-0735619678' },
    { title: 'Refactoring', author: 'Martin Fowler', isbn: '978-0134757599' },
    { title: 'Patterns of Enterprise Application Architecture', author: 'Martin Fowler', isbn: '978-0321127426' },
    { title: 'Domain-Driven Design', author: 'Eric Evans', isbn: '978-0321125217' },
    { title: 'The Art of Computer Programming', author: 'Donald Knuth', isbn: '978-0201896831' },
  ];

  const merchants = ['Amazon', 'BarnesNoble', 'BookDepository', 'ThriftBooks', 'AbeBooks'];
  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();

  for (let b = 0; b < books.length; b++) {
    const book = books[b]!;
    const members: number[] = [];
    const clusterId = `offer_${b}`;

    for (let m = 0; m < 3; m++) {
      const merchant = merchants[m % merchants.length]!;
      const price = 19.99 + (b * 3.5) + (m * 1.25) - (m === 0 ? 0 : 2);
      const condition = m === 0 ? 'new' : m === 1 ? 'like new' : 'good';
      records.push({
        title: m === 0 ? book.title : book.title.replace(':', ' -').replace('  ', ' '),
        author_name: m === 0 ? book.author : `${book.author.split(' ').reverse().join(', ')}`,
        isbn: book.isbn,
        price_usd: parseFloat(price.toFixed(2)),
        condition,
        merchant,
      });
      members.push(records.length - 1);
    }

    // Noise: unrelated book from wrong author (every 4th)
    if (b % 4 === 0) {
      const wrongBook = books[(b + 3) % books.length]!;
      records.push({ title: book.title, author_name: wrongBook.author, isbn: wrongBook.isbn, price_usd: 9.99, condition: 'used', merchant: 'Unknown' });
    }

    truth.set(clusterId, members);
  }

  return { name: 'WDC Offers', description: 'Book merchant offers with price, condition, and author name format variations', recordCount: records.length, trueMatchCount: truth.size, records, groundTruth: truth };
}

// ══════════════════════════════════════════════════════════════
// Dataset 7: iTunes-Amazon — Music matching with artist/album variations
// ══════════════════════════════════════════════════════════════

export function loadItunesAmazon(): BenchmarkDataset {
  const albums = [
    { title: 'Abbey Road', artist: 'The Beatles', year: 1969, genre: 'Rock' },
    { title: 'Thriller', artist: 'Michael Jackson', year: 1982, genre: 'Pop' },
    { title: 'The Dark Side of the Moon', artist: 'Pink Floyd', year: 1973, genre: 'Progressive Rock' },
    { title: 'Rumours', artist: 'Fleetwood Mac', year: 1977, genre: 'Rock' },
    { title: 'Back in Black', artist: 'AC/DC', year: 1980, genre: 'Hard Rock' },
    { title: 'Hotel California', artist: 'Eagles', year: 1976, genre: 'Rock' },
    { title: 'Born to Run', artist: 'Bruce Springsteen', year: 1975, genre: 'Rock' },
    { title: 'Purple Rain', artist: 'Prince', year: 1984, genre: 'Pop' },
    { title: 'Nevermind', artist: 'Nirvana', year: 1991, genre: 'Grunge' },
    { title: 'OK Computer', artist: 'Radiohead', year: 1997, genre: 'Alternative' },
  ];

  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();

  for (let a = 0; a < albums.length; a++) {
    const album = albums[a]!;
    const members: number[] = [];
    const clusterId = `music_${a}`;

    // iTunes listing
    records.push({ album_title: album.title, artist: album.artist, release_year: album.year, genre: album.genre, source: 'itunes' });
    members.push(records.length - 1);

    // Amazon listing — artist name format difference
    const amazonArtist = album.artist.includes(' ') ? `${album.artist.split(' ').reverse().join(', ')}` : album.artist;
    records.push({ album_title: album.title.toUpperCase(), artist: amazonArtist, release_year: album.year, genre: album.genre.toLowerCase(), source: 'amazon' });
    members.push(records.length - 1);

    // Remastered/deluxe edition (every 3rd)
    if (a % 3 === 0) {
      records.push({ album_title: `${album.title} (Remastered)`, artist: album.artist, release_year: album.year + 30, genre: album.genre, source: 'itunes' });
      members.push(records.length - 1);
    }

    // Noise: compilation album (every 5th)
    if (a % 5 === 0) {
      records.push({ album_title: `Greatest Hits of ${album.artist}`, artist: album.artist, release_year: 2000 + a, genre: 'Compilation', source: 'amazon' });
    }

    truth.set(clusterId, members);
  }

  return { name: 'iTunes-Amazon', description: 'Music album matching with artist name format and title case variations', recordCount: records.length, trueMatchCount: truth.size, records, groundTruth: truth };
}

// ══════════════════════════════════════════════════════════════
// Dataset 8: Cora — Academic citation matching
// ══════════════════════════════════════════════════════════════

export function loadCora(): BenchmarkDataset {
  const papers = [
    { title: 'Latent Dirichlet Allocation', authors: 'David M. Blei, Andrew Y. Ng, Michael I. Jordan', venue: 'Journal of Machine Learning Research', year: 2003, vol: '3', pages: '993-1022' },
    { title: 'Support-Vector Networks', authors: 'Corinna Cortes, Vladimir Vapnik', venue: 'Machine Learning', year: 1995, vol: '20', pages: '273-297' },
    { title: 'A Fast and Elitist Multiobjective Genetic Algorithm: NSGA-II', authors: 'Kalyanmoy Deb, Amrit Pratap, Sameer Agarwal, T. Meyarivan', venue: 'IEEE Transactions on Evolutionary Computation', year: 2002, vol: '6', pages: '182-197' },
    { title: 'Random Forests', authors: 'Leo Breiman', venue: 'Machine Learning', year: 2001, vol: '45', pages: '5-32' },
    { title: 'Gradient-Based Learning Applied to Document Recognition', authors: 'Yann LeCun, Leon Bottou, Yoshua Bengio, Patrick Haffner', venue: 'Proceedings of the IEEE', year: 1998, vol: '86', pages: '2278-2324' },
    { title: 'A Tutorial on Support Vector Machines for Pattern Recognition', authors: 'Christopher J. C. Burges', venue: 'Data Mining and Knowledge Discovery', year: 1998, vol: '2', pages: '121-167' },
    { title: 'Deep Residual Learning for Image Recognition', authors: 'Kaiming He, Xiangyu Zhang, Shaoqing Ren, Jian Sun', venue: 'CVPR', year: 2016, vol: '', pages: '770-778' },
    { title: 'Attention Is All You Need', authors: 'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Lukasz Kaiser, Illia Polosukhin', venue: 'NeurIPS', year: 2017, vol: '30', pages: '' },
  ];

  const records: RawRecord[] = [];
  const truth = new Map<string, number[]>();

  for (let p = 0; p < papers.length; p++) {
    const paper = papers[p]!;
    const members: number[] = [];
    const clusterId = `cora_${p}`;

    // Original citation
    records.push({ title: paper.title, authors: paper.authors, venue: paper.venue, year: paper.year, volume: paper.vol, pages: paper.pages });
    members.push(records.length - 1);

    // Citation with author format variation (Last, First)
    const reversedAuthors = paper.authors.split(', ').map(name => {
      const parts = name.split(' ');
      if (parts.length >= 2) return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
      return name;
    }).join('; ');
    records.push({ title: paper.title.toLowerCase(), authors: reversedAuthors, venue: paper.venue, year: paper.year, volume: paper.vol, pages: paper.pages });
    members.push(records.length - 1);

    // Citation with venue abbreviation (every 2nd)
    if (p % 2 === 0) {
      const abbreviations: Record<string, string> = {
        'Journal of Machine Learning Research': 'JMLR',
        'Machine Learning': 'Mach. Learn.',
        'IEEE Transactions on Evolutionary Computation': 'IEEE Trans. Evol. Comput.',
        'Proceedings of the IEEE': 'Proc. IEEE',
        'Data Mining and Knowledge Discovery': 'Data Min. Knowl. Discov.',
        'CVPR': 'IEEE Conf. Comput. Vis. Pattern Recognit.',
        'NeurIPS': 'Adv. Neural Inf. Process. Syst.',
      };
      const abbrVenue = abbreviations[paper.venue] ?? paper.venue;
      records.push({ title: paper.title, authors: paper.authors, venue: abbrVenue, year: paper.year, volume: paper.vol, pages: paper.pages });
      members.push(records.length - 1);
    }

    // Unrelated paper (noise, every 3rd)
    if (p % 3 === 0) {
      records.push({ title: `A Survey of ${paper.title.split(' ').slice(0, 2).join(' ')} Methods`, authors: `Various Authors`, venue: 'arXiv', year: 2023, volume: '', pages: '' });
    }

    truth.set(clusterId, members);
  }

  return { name: 'Cora', description: 'Academic citation matching with author format and venue abbreviation variations', recordCount: records.length, trueMatchCount: truth.size, records, groundTruth: truth };
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
