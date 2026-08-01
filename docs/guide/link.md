# Gazetteer Linking & Record Linkage

The `@agentix-e/entity-resolver-core` package provides two forms of cross-dataset matching: **gazetteer matching** (query records against a reference index) and **record linkage** (linking records across two datasets).

## What Is Gazetteer Linking

Gazetteer linking matches incoming query records against a private knowledge base (the gazetteer). Unlike deduplication (finding duplicates within one dataset), gazetteer matching is an O(m x n) operation — each query record is compared against every record in the index.

Common use cases:

- **Customer matching**: Match incoming leads against existing customer database
- **Product catalog linking**: Match scraped products against a master catalog
- **Entity resolution for search**: Resolve user search queries to canonical entities
- **Watchlist screening**: Check transactions against a sanctions list

## Creating a Gazetteer

A gazetteer is simply an array of records — there's no special index class. The engine handles blocking and comparison internally:

```typescript
import { gazetteerMatch } from '@agentix-e/entity-resolver-core';
import type { GazetteerConfig } from '@agentix-e/entity-resolver-core';

// Reference knowledge base (the gazetteer)
const productCatalog = [
  { sku: 'LAP-001', name: 'MacBook Pro 16" M4',   price: 2499.00 },
  { sku: 'LAP-002', name: 'ThinkPad X1 Carbon',    price: 1899.00 },
  { sku: 'LAP-003', name: 'Dell XPS 15',           price: 1999.00 },
  { sku: 'LAP-004', name: 'MacBook Air 15" M4',    price: 1299.00 },
];

// Incoming records to match against the catalog
const incomingProducts = [
  { name: 'Macbook Pro 16 inch M4',       price: 2499 },
  { name: 'Dell XPS 15 2026',             price: 2000 },
  { name: 'Lenovo Thinkpad Carbon X1',    price: 1850 },
];

const config: GazetteerConfig = {
  comparisons: [
    {
      field: 'name',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'strong_match', threshold: 0.85 },
        { label: 'moderate_match', threshold: 0.7 },
      ],
    },
    {
      field: 'price',
      scorerName: 'numeric_diff',
      levels: [
        { label: 'exact_price', threshold: 0.99 },
        { label: 'close_price', threshold: 0.95 },
      ],
    },
  ],
  matchThreshold: 0.7,
};

const result = await gazetteerMatch(incomingProducts, productCatalog, config);

console.log(`Total matches: ${result.queryToIndexMatches.length}`);
for (const match of result.queryToIndexMatches.slice(0, 5)) {
  const query = incomingProducts[match.leftId];
  const indexed = productCatalog[match.rightId - incomingProducts.length];
  console.log(
    `${query?.['name']} → ${indexed?.['name']} (score: ${match.score.toFixed(3)})`,
  );
}
```

## Running Pairwise Linkage

The `linkRecords()` API links two separate datasets (Left and Right). This is the standard "record linkage" workflow for joining tables without a common key:

```typescript
import { linkRecords, blockOn } from '@agentix-e/entity-resolver-core';
import type { RecordLinkConfig } from '@agentix-e/entity-resolver-core';

const leftRecords = [
  { id: 'A1', company: 'Google LLC',          city: 'Mountain View' },
  { id: 'A2', company: 'Meta Platforms Inc.',  city: 'Menlo Park' },
  { id: 'A3', company: 'Apple Inc.',           city: 'Cupertino' },
];

const rightRecords = [
  { id: 'B1', company: 'Google Inc.',              city: 'Mountain View, CA' },
  { id: 'B2', company: 'Facebook',                 city: 'Menlo Park' },
  { id: 'B3', company: 'Microsoft Corporation',    city: 'Redmond' },
];

const config: RecordLinkConfig = {
  blocking: {
    passes: [blockOn('city')],
  },
  comparisons: [
    {
      field: 'company',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'strong_match', threshold: 0.85 },
        { label: 'moderate_match', threshold: 0.7 },
      ],
    },
  ],
  matchThreshold: 0.7,
};

const result = await linkRecords(leftRecords, rightRecords, config);

console.log(`Cross pairs found: ${result.crossPairs.length}`);
for (const pair of result.crossPairs) {
  const left = leftRecords[pair.leftId];
  const right = rightRecords[pair.rightId - leftRecords.length];
  console.log(`${left?.['company']} ↔ ${right?.['company']} (${pair.score.toFixed(3)})`);
}

// Output:
// Google LLC ↔ Google Inc. (0.92)
// Meta Platforms Inc. ↔ Facebook (0.88)
```

### SQL Pushdown Linkage

For large datasets, use `runSqlLinkage()` to push comparisons into DuckDB:

```typescript
import { runSqlLinkage, blockOn } from '@agentix-e/entity-resolver-core';
import type { ISqlBackend } from '@agentix-e/entity-resolver-core';

async function largeScaleLinkage(
  left: Record<string, unknown>[],
  right: Record<string, unknown>[],
  backend: ISqlBackend,
) {
  const result = await runSqlLinkage(left, right, {
    blocking: {
      passes: [
        blockOn('company'),
        blockOn('city'),
      ],
    },
    comparisons: [
      {
        field: 'company',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
          { label: 'strong_match', threshold: 0.85 },
        ],
      },
      {
        field: 'city',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact_match', threshold: 0.99 },
        ],
      },
    ],
    matchThreshold: 0.7,
  }, backend);

  console.log(`SQL pairs: ${result.pairs.length}`);
  console.log(`Blocking: ${result.timing.blockingMs}ms`);
  console.log(`Comparison: ${result.timing.comparisonMs}ms`);

  return result;
}
```

## Golden Record Survivorship

After linking records across datasets, you often need to merge the matched entities into a single canonical record. The `buildGoldenRecord()` function handles this with field-level survivorship strategies:

```typescript
import { buildGoldenRecord, linkRecords, blockOn } from '@agentix-e/entity-resolver-core';
import type { GoldenRecordConfig } from '@agentix-e/entity-resolver-core';

// Records from two different CRMs — company names have different formats
const crm1 = [
  { id: '1', name: 'International Business Machines', employees: 282000, city: 'Armonk' },
];

const crm2 = [
  { id: '2', name: 'IBM Corp.',                        employees: 288000, city: 'Armonk, NY' },
];

// Step 1: Link the datasets
const linkResult = await linkRecords(crm1, crm2, {
  blocking: { passes: [blockOn('city')] },
  comparisons: [
    {
      field: 'name',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'strong_match', threshold: 0.80 },
      ],
    },
  ],
  matchThreshold: 0.5,
});

// Step 2: Build golden record from matched entities
for (const entry of linkResult.clusters) {
  const [, cluster] = entry;
  const memberRecords = [
    crm1[cluster.memberIds[0]! % crm1.length],
    crm2[(cluster.memberIds[1]! % crm2.length)],
  ].filter(Boolean);

  const goldenConfig: GoldenRecordConfig = {
    rules: [
      { field: 'name',      strategy: 'longest' },       // most descriptive name
      { field: 'employees', strategy: 'max' },           // take higher count
      { field: 'city',      strategy: 'most_complete' }, // prefer "Armonk, NY" over "Armonk"
    ],
    defaultStrategy: 'longest',
  };

  const golden = buildGoldenRecord(memberRecords as Record<string, unknown>[], goldenConfig);
  console.log('Golden record:', golden.goldenRecord);
  // { name: 'International Business Machines', employees: 288000, city: 'Armonk, NY' }
  console.log('Field sources:', golden.fieldSources);
}
```

### Available Survivorship Strategies

| Strategy | Behavior | Best For |
|---|---|---|
| `longest` | Longest string value | Names, descriptions |
| `most_popular` | Most frequent value | Standardized codes, categories |
| `most_complete` | Value from the most populated record | Enriched master records |
| `source_priority` | Based on source priority map | Authoritative data sources |
| `first` | First non-empty value in cluster | Order-dependent data |
| `concatenate` | All unique values joined with separator | Tags, aliases |
| `avg` | Numeric average | Metrics, scores |
| `min` | Numeric minimum | Prices, dates |
| `max` | Numeric maximum | Maximum values |
| `sum` | Numeric sum | Totals, aggregates |
| `median` | Numeric median | Robust central tendency |
| `most_recent` | Most recent ISO 8601 date | Update timestamps |
| `oldest` | Oldest ISO 8601 date | Creation dates |

## Use Cases

### Customer Matching Against a Database

```typescript
import { gazetteerMatch } from '@agentix-e/entity-resolver-core';

// Staged leads with messy data
const newLeads = [
  { name: 'Jane Doe',    email: 'jane.doe@example.com',  phone: '555-0123' },
  { name: 'John Smith',  email: 'jsmith@gmail.com',       phone: '555-4567' },
];

// Existing customer database (clean, canonical)
const customerDb = [
  { name: 'Jane A. Doe',      email: 'janedoe@example.com',  phone: '+1-555-0123' },
  { name: 'Robert Johnson',   email: 'rob@company.com',      phone: '555-8901' },
];

const result = await gazetteerMatch(newLeads, customerDb, {
  comparisons: [
    {
      field: 'email',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'similar', threshold: 0.80 },
      ],
    },
    {
      field: 'phone',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'same_digits', threshold: 0.90 },
      ],
    },
    {
      field: 'name',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'strong_match', threshold: 0.85 },
      ],
    },
  ],
  matchThreshold: 0.6,
});

// Jane Doe matched (email + phone), John Smith unmatched (new lead)
for (const match of result.queryToIndexMatches) {
  const lead = newLeads[match.leftId];
  const customer = customerDb[match.rightId - newLeads.length];
  console.log(`${lead?.['name']} → ${customer?.['name']} (${match.score.toFixed(3)})`);
}
```

### Product Catalog Linking

```typescript
import { linkRecords, blockOn } from '@agentix-e/entity-resolver-core';

// Scraped products from a marketplace
const scrapedProducts = [
  { title: 'Apple iPhone 16 Pro 256GB',     price: 1099.00,  category: 'Smartphones' },
  { title: 'Samsung Galaxy S25 Ultra',      price: 1299.00,  category: 'Smartphones' },
  { title: 'Sony WH-1000XM6 Headphones',    price: 349.00,   category: 'Audio' },
];

// Master product catalog
const masterCatalog = [
  { title: 'iPhone 16 Pro (256GB)',         price: 1099.00,  category: 'Phones',   sku: 'IP16P-256' },
  { title: 'Galaxy S25 Ultra 512GB',        price: 1299.00,  category: 'Phones',   sku: 'SG-S25U' },
  { title: 'Bose QuietComfort Ultra',       price: 329.00,   category: 'Audio',    sku: 'BQC-ULTRA' },
];

const result = await linkRecords(scrapedProducts, masterCatalog, {
  blocking: {
    passes: [blockOn('category')],
  },
  comparisons: [
    {
      field: 'title',
      scorerName: 'jaro_winkler',
      levels: [
        { label: 'exact_match', threshold: 0.99 },
        { label: 'strong_match', threshold: 0.80 },
        { label: 'moderate_match', threshold: 0.65 },
      ],
    },
    {
      field: 'price',
      scorerName: 'numeric_diff',
      levels: [
        { label: 'exact_price', threshold: 0.99 },
        { label: 'close_price', threshold: 0.90 },
      ],
    },
  ],
  matchThreshold: 0.7,
});

// Matched:
//   Apple iPhone 16 Pro → iPhone 16 Pro (title + price match)
//   Samsung Galaxy S25 Ultra → Galaxy S25 Ultra (title + price match)
//   Sony WH-1000XM6 → unmatched (different brand, different price)
```

## Complete Runnable Example

This example demonstrates querying a customer database, linking matches, and building golden records:

```typescript
import {
  gazetteerMatch,
  buildGoldenRecord,
} from '@agentix-e/entity-resolver-core';
import type { GoldenRecordConfig } from '@agentix-e/entity-resolver-core';

async function main() {
  // ── Reference database ──
  const customers = [
    { id: 'C001', name: 'Sarah Johnson',  email: 'sarah.j@email.com',  city: 'Chicago', lifetime: 12450 },
    { id: 'C002', name: 'Michael Chen',   email: 'mchen@work.com',     city: 'SF',      lifetime: 8900 },
    { id: 'C003', name: 'Emily Davis',    email: 'emily.d@email.com',  city: 'NYC',     lifetime: 22300 },
    { id: 'C004', name: 'James Wilson',   email: 'jwilson@corp.com',   city: 'Austin',  lifetime: 5100 },
  ];

  // ── Incoming records to match ──
  const leads = [
    { name: 'Sara Johnson',   email: 'sarah.johnson@email.com',  city: 'Chicago, IL' },
    { name: 'Mike Chen',      email: 'michael.chen@work.com',    city: 'San Francisco' },
    { name: 'Jane Smith',     email: 'jsmith@newcorp.com',       city: 'Portland' },
  ];

  // ── Gazetteer match ──
  const result = await gazetteerMatch(leads, customers, {
    comparisons: [
      {
        field: 'email',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact', threshold: 0.99 },
          { label: 'similar', threshold: 0.75 },
        ],
      },
      {
        field: 'name',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'exact', threshold: 0.99 },
          { label: 'strong', threshold: 0.82 },
          { label: 'moderate', threshold: 0.65 },
        ],
      },
      {
        field: 'city',
        scorerName: 'jaro_winkler',
        levels: [
          { label: 'same', threshold: 0.75 },
        ],
      },
    ],
    matchThreshold: 0.6,
  });

  console.log(`\nMatches found: ${result.queryToIndexMatches.length}`);

  // ── Build golden records for matched pairs ──
  const goldenConfig: GoldenRecordConfig = {
    rules: [
      { field: 'name',  strategy: 'longest' },
      { field: 'email', strategy: 'most_popular' },
      { field: 'city',  strategy: 'most_complete' },
      { field: 'lifetime', strategy: 'max' },
    ],
    defaultStrategy: 'longest',
  };

  for (const match of result.queryToIndexMatches) {
    const lead = leads[match.leftId];
    const customer = customers[match.rightId - leads.length];

    const golden = buildGoldenRecord(
      [lead as Record<string, unknown>, customer as Record<string, unknown>],
      goldenConfig,
    );

    console.log(`\nMatch score: ${match.score.toFixed(3)}`);
    console.log(`  Lead:     ${lead?.['name']} <${lead?.['email']}>`);
    console.log(`  Customer: ${customer?.['name']} <${customer?.['email']}>`);
    console.log(`  Golden:   ${golden.goldenRecord['name']} <${golden.goldenRecord['email']}>`);
    console.log(`  Sources:  ${golden.sourceCount} records consolidated`);
  }

  // ── Unmatched leads ──
  const matchedLeadIds = new Set(result.queryToIndexMatches.map((m) => m.leftId));
  for (let i = 0; i < leads.length; i++) {
    if (!matchedLeadIds.has(i)) {
      console.log(`\nUnmatched: ${leads[i]?.['name']} — new prospect`);
    }
  }
}

main().catch(console.error);
```

Expected output:

```
Matches found: 2

Match score: 0.850
  Lead:     Sara Johnson <sarah.johnson@email.com>
  Customer: Sarah Johnson <sarah.j@email.com>
  Golden:   Sarah Johnson <sarah.j@email.com>
  Sources:  2 records consolidated

Match score: 0.820
  Lead:     Mike Chen <michael.chen@work.com>
  Customer: Michael Chen <mchen@work.com>
  Golden:   Michael Chen <michael.chen@work.com>
  Sources:  2 records consolidated

Unmatched: Jane Smith — new prospect
```
