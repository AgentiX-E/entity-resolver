# Scenario: Linking Two Product Catalogs

Linking records across separate data sources — e.g., matching your product catalog against a supplier's.

## Data Preparation

Two CSV files from different sources:

```csv
# your_catalog.csv
product_id, name, manufacturer, price
P001, iPhone 14 Pro, Apple, 999
P002, Samsung Galaxy S23, Samsung, 849

# supplier_catalog.csv
sku, product_name, brand, cost
SKU-A, iPhone 14 Pro Max, Apple Inc, 950
SKU-B, Galaxy S23 Ultra, Samsung Electronics, 800
```

## Step 1: Load Both Datasets

```typescript
import { runSqlLinkage } from '@agentix-e/entity-resolver-core';
import { NodeDuckDBBackend } from '@agentix-e/entity-resolver-node';

const yourProducts = loadCSV('your_catalog.csv');
const supplierProducts = loadCSV('supplier_catalog.csv');
```

## Step 2: Configure Linkage

```typescript
const config = {
  comparisons: [
    { field: 'name', scorerName: 'jaro_winkler', levels: [{ name: 'similar' }] },
    { field: 'manufacturer', scorerName: 'jaro_winkler', levels: [{ name: 'similar' }] },
  ],
  blocking: {
    passes: [
      { fields: ['name'], transforms: ['lowercase'] },
      { fields: ['manufacturer'], transforms: ['lowercase'] },
    ],
  },
};

const backend = new NodeDuckDBBackend(':memory:');
// Linkage: matches your products against supplier products only
// No self-matching within either catalog
const result = await runSqlLinkage(yourProducts, supplierProducts, config, backend);
await backend.close();
```

## Step 3: Interpret Matches

```typescript
for (const pair of result.pairs) {
  const your = yourProducts[pair.leftId];
  const supplier = supplierProducts[pair.rightId];
  if (pair.score > 0.6) {
    console.log(`${your.name} ↔ ${supplier.product_name} (score: ${pair.score.toFixed(2)})`);
  }
}
// Output:
// iPhone 14 Pro ↔ iPhone 14 Pro Max (score: 0.82)
// Samsung Galaxy S23 ↔ Galaxy S23 Ultra (score: 0.71)
```

## Key Differences from Deduplication

| Aspect | Dedupe (`runPipeline`) | Linkage (`runSqlLinkage`) |
|--------|----------------------|--------------------------|
| Input | Single record pool | Left pool + Right pool |
| Comparisons | All pairs within pool | Only cross-pool pairs |
| Output | Clusters of duplicate groups | Left↔Right scored pairs |
| Use case | Clean CRM duplicates | Match supplier catalog to yours |

## Environment

> Linkage mode supports the same execution environments as dedupe: Node.js with DuckDB, Browser with DuckDB WASM, and PostgreSQL backend. Configuration format is identical — only the API function changes.
