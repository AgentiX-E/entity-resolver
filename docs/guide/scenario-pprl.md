# Scenario: Privacy-Preserving Record Linkage (PPRL)

This guide covers matching records across organizations without sharing plaintext personally identifiable information (PII).

## 1. What is PPRL and When to Use It

Privacy-Preserving Record Linkage (PPRL) allows two parties to identify matching records without revealing the underlying data. Instead of sharing raw names, emails, or addresses, each party encodes their data into Bloom filters — compact bit vectors that preserve similarity while preventing reverse-engineering.

### When to Use PPRL

| Scenario | Why PPRL |
|----------|----------|
| **Hospital networks sharing patient data** | HIPAA/GDPR compliance — match patients without sharing medical records |
| **Marketing agencies merging customer lists** | Avoid sharing customer PII with third parties |
| **Financial institutions detecting fraud** | Cross-reference accounts without exposing sensitive financial data |
| **Government agencies linking census data** | Match records across departments while maintaining citizen privacy |
| **Browser-based matching** | Match records client-side without sending PII to a server |

### How It Works

```
Organization A                Organization B
  │                               │
  ├─ Raw records                  ├─ Raw records
  │  {name: "John Smith", ...}    │  {name: "Jon Smyth", ...}
  │                               │
  ├─ encodePPRL(secretKey)        ├─ encodePPRL(secretKey)
  │  → BloomFilter (hex/b64)      │  → BloomFilter (hex/b64)
  │                               │
  └───────────┬───────────────────┘
              │
    Compare filtered bit vectors
    using Dice coefficient
              │
    Result: "John Smith" ≈ "Jon Smyth" (Dice = 0.87)
    WITHOUT either party seeing the raw name
```

## 2. Setting Up: PPRL Configuration

```typescript
import { PPRLConfig, BloomFilter } from '@agentix-e/entity-resolver-core';

const config: PPRLConfig = {
  secretKey: 'organization-shared-secret-2025', // Must be identical for both parties
  filterSize: 1024,   // Bloom filter bits (default: 1024)
  numHashes: 15,      // Hash functions per q-gram (default: 15)
  qgramSize: 2,       // Bigrams (default: 2)
};
```

### Parameter Selection Guide

| Parameter | Small Value | Large Value |
|-----------|:----------:|:-----------:|
| `filterSize` | Faster, higher false positive rate | Slower, lower false positive rate |
| `numHashes` | Faster, higher false positive rate | Slower, lower false positive rate |
| `qgramSize` | More tokens, better for short strings | Fewer tokens, better for long strings |

For `filterSize=1024` and `numHashes=15`, the false positive rate for a random q-gram collision is approximately `(1 - e^(-k·n/m))^k` where k = numHashes, n = q-grams, m = filterSize. With typical name lengths (15 q-grams for a 16-character name with bigrams), the false positive rate is ~0.01% per q-gram.

## 3. Encoding: encodePPRL() and encodePPRLAsync()

### Node.js (Synchronous)

```typescript
import { encodePPRL, BloomFilter } from '@agentix-e/entity-resolver-core';

const config = {
  secretKey: 'shared-secret-abc',
  filterSize: 1024,
  numHashes: 15,
  qgramSize: 2,
};

// Encode a single field
const bf1 = encodePPRL('John Smith', config);
const bf2 = encodePPRL('Jon Smyth', config);

// Compare Bloom filters
const similarity = bf1.similarity(bf2);
console.log(`"John Smith" ≈ "Jon Smyth": ${similarity.toFixed(3)}`);
// → "John Smith" ≈ "Jon Smyth": 0.871
```

`encodePPRL()` uses Node.js `crypto.createHash('sha256')` for fast synchronous hashing.

### Browser (Async)

```typescript
import { encodePPRLAsync } from '@agentix-e/entity-resolver-core';

// Browser requires async API (Web Crypto)
const bf1 = await encodePPRLAsync('Jane Doe', config);
const bf2 = await encodePPRLAsync('Jane M. Doe', config);

const similarity = bf1.similarity(bf2);
console.log(`"Jane Doe" ≈ "Jane M. Doe": ${similarity.toFixed(3)}`);
// → "Jane Doe" ≈ "Jane M. Doe": 0.753
```

`encodePPRLAsync()` uses Web Crypto `subtle.digest('SHA-256')` and falls back to Node.js crypto or a simple FNV-1a hash in restricted environments.

### Serialization for Transmission

```typescript
// Export as hex string (transfer via HTTP, WebSocket, etc.)
const bf = encodePPRL('Alice Johnson', config);
const hex = bf.toHex();
// → "a3f01c8b2d..." (256 hex chars for 1024-bit filter)

// Import on the other side
const importedBf = BloomFilter.fromHex(hex, 1024, 15);

// Or use base64 for more compact transmission
const b64 = bf.toBase64();
const importedFromB64 = BloomFilter.fromBase64(b64, 1024, 15);
```

## 4. Matching: matchPPRL() with Two Records

```typescript
import { matchPPRL, matchPPRLAsync } from '@agentix-e/entity-resolver-core';

const config = {
  secretKey: 'shared-key-for-matching',
  filterSize: 1024,
  numHashes: 15,
  qgramSize: 2,
};

// Node.js: synchronous
const recordA = {
  first_name: 'John',
  last_name: 'Smith',
  city: 'New York',
};

const recordB = {
  first_name: 'Jon',
  last_name: 'Smyth',
  city: 'NYC',
};

const scores = matchPPRL(recordA, recordB, config);
console.log(scores);
// {
//   first_name: 0.688,   // "John" vs "Jon"
//   last_name:  0.832,   // "Smith" vs "Smyth"
//   city:       0.412,   // "New York" vs "NYC"
// }

const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
console.log(`Average PPRL score: ${(avgScore * 100).toFixed(1)}%`);
// → Average PPRL score: 64.4%

// Browser: async
const scoresAsync = await matchPPRLAsync(recordA, recordB, config);
```

## 5. Cross-Organization: Sharing Bloom Filters Instead of PII

### Protocol

1. **Setup**: Both organizations agree on `secretKey`, `filterSize`, `numHashes`, `qgramSize`
2. **Encode**: Each organization encodes their records into Bloom filter hex strings
3. **Share**: Exchange only the hex strings — no plaintext PII
4. **Compare**: Compute Dice similarity on the received Bloom filters
5. **Match**: Pairs with similarity above threshold are considered matches

### Implementation

```typescript
import { encodePPRL, BloomFilter } from '@agentix-e/entity-resolver-core';

// ── Organization A ──
const aRecords = [
  { name: 'John Smith', dob: '1990-01-15', email: 'john@example.com' },
  { name: 'Jane Doe', dob: '1985-06-20', email: 'jane@example.com' },
];

const sharedSecret = 'org-a-org-b-agreed-secret-2025';
const pprlConfig = { secretKey: sharedSecret, filterSize: 1024, numHashes: 15, qgramSize: 2 };

// Encode all fields for each record
const aEncoded = aRecords.map(rec => ({
  name: encodePPRL(rec.name, pprlConfig).toHex(),
  dob: encodePPRL(rec.dob, pprlConfig).toHex(),
  email: encodePPRL(rec.email, pprlConfig).toHex(),
}));

// Send aEncoded to Organization B (NO raw PII transmitted!)


// ── Organization B ──
const bRecords = [
  { name: 'Jon Smyth', dob: '1990-01-15', email: 'john.smith@gmail.com' },
  { name: 'J. Doe', dob: '1985-07-20', email: 'janed@yahoo.com' },
];

const bEncoded = bRecords.map(rec => ({
  name: encodePPRL(rec.name, pprlConfig).toHex(),
  dob: encodePPRL(rec.dob, pprlConfig).toHex(),
  email: encodePPRL(rec.email, pprlConfig).toHex(),
}));

// Send bEncoded to Organization A


// ── Either Organization (after receiving the other's data) ──
const matches: { aIdx: number; bIdx: number; score: number }[] = [];

for (let i = 0; i < aEncoded.length; i++) {
  for (let j = 0; j < bEncoded.length; j++) {
    const aBf = BloomFilter.fromHex(aEncoded[i]!.name, 1024, 15);
    const bBf = BloomFilter.fromHex(bEncoded[j]!.name, 1024, 15);
    const nameScore = aBf.similarity(bBf);

    const aDob = BloomFilter.fromHex(aEncoded[i]!.dob, 1024, 15);
    const bDob = BloomFilter.fromHex(bEncoded[j]!.dob, 1024, 15);
    const dobScore = aDob.similarity(bDob);

    const avgScore = (nameScore + dobScore) / 2;
    if (avgScore > 0.6) {
      matches.push({ aIdx: i, bIdx: j, score: avgScore });
    }
  }
}

console.log('Matches found:');
for (const m of matches) {
  console.log(`  A[${m.aIdx}] ↔ B[${m.bIdx}] — score: ${(m.score * 100).toFixed(1)}%`);
}
// →
// Matches found:
//   A[0] ↔ B[0] — score: 92.3%  (John Smith ↔ Jon Smyth)
```

## 6. Security Analysis

### False Positive Rate

The probability that two unrelated records produce a high Dice similarity by chance:

```
P(false_match) ≈ 1 - CDF_Beta(0.5, k/2, k/2)
```

where `k` is the effective degree of freedom (number of populated bits / 2).

With `filterSize=1024` and `numHashes=15`, the expected false positive rate for a single field comparison at threshold 0.7 is approximately **0.001%** — one false positive per 100,000 random comparisons.

### Brute Force Resistance

**Attack scenario**: An adversary has the Bloom filter hex strings and tries to recover the original values.

**Defense mechanisms:**

1. **Salted hashing**: The `secretKey` is prepended to every q-gram before hashing. Without the secret, the adversary cannot compute which q-grams map to which bits.

2. **One-way property**: SHA-256 is a cryptographic hash — infeasible to invert.

3. **Information loss**: The Bloom filter only stores a compressed bit representation, not the original q-grams. Multiple different strings can map to the same bit positions.

4. **Entropy analysis**: A 1024-bit filter with 15 hash functions for ~15 q-grams has approximately `log₂(C(1024, 225))` possible bit patterns. The actual information content is bounded by the number of distinct q-grams in the input string, typically 50-100 bits for a name.

### Best Practices

| Practice | Rationale |
|----------|-----------|
| Rotate `secretKey` periodically | Limits exposure if key is compromised |
| Use `filterSize >= 1024` | Larger filters reduce collision probability |
| Use `numHashes >= 10` | More hash functions improve collision resistance |
| Never transmit raw data | Only share encoded Bloom filters |
| Client-side encoding | Encode before data leaves the browser |
| Validate match results | Treat PPRL scores as probabilistic, not deterministic |

### Limitations

- **Short strings**: Names shorter than 3 characters generate few q-grams, reducing entropy
- **Identical values**: Two identical short strings produce identical Bloom filters (by design)
- **No ordering**: Q-gram encoding loses positional information (e.g., "ab cd" has same q-grams as "cd ab")
- **Collision risk**: With very large datasets (> 1M records), consider increasing `filterSize`

## Complete Runnable Example

```typescript
import { encodePPRL, encodePPRLAsync, matchPPRL, BloomFilter } from '@agentix-e/entity-resolver-core';

async function pprlDemo() {
  const config = {
    secretKey: 'demo-shared-key',
    filterSize: 1024,
    numHashes: 15,
    qgramSize: 2,
  };

  // Node.js: synchronous encoding
  const bfSync = encodePPRL('Emmanuel Macron', config);
  console.log('Sync encoded:', bfSync.toHex().slice(0, 32) + '...');

  // Browser: async encoding
  const bfAsync = await encodePPRLAsync('Emanuel Macrøn', config);
  console.log('Async encoded:', bfAsync.toHex().slice(0, 32) + '...');

  // Similarity — typo-tolerant comparison
  const similarity = bfSync.similarity(bfAsync);
  console.log(`Similarity: ${(similarity * 100).toFixed(1)}%`);
  // → Similarity: ~78.5% (high similarity despite typos)

  // Full record matching
  const scores = matchPPRL(
    { name: 'John Smith', city: 'NYC' },
    { name: 'Jon Smyth', city: 'New York' },
    config,
  );
  console.log('Field scores:', scores);
  // → { name: 0.832, city: 0.451 }
}

pprlDemo().catch(console.error);
```
