# Entity Extraction

The `@agentix-e/entity-resolver-extract` package pulls structured entities from unstructured text using a 3-layer cascade: Pattern Match, ONNX NER, and LLM Fallback. This ensures 90% of extractions cost $0 while maintaining 100% coverage.

## What Is Entity Extraction

Entity extraction converts natural language text into typed field values. Instead of writing brittle regex for every input, you define a **schema** of what you want extracted and let the engine find it.

```typescript
// Input: unstructured text
const text = "Contact John Smith at john.smith@acme.com or call +1-555-0123";

// Schema: what you want
const fields = [
  { name: 'name', type: 'string' },
  { name: 'email', type: 'email' },
  { name: 'phone', type: 'phone' },
];

// Output: structured data
// { name: undefined, email: 'john.smith@acme.com', phone: '+1-555-0123' }
```

This is the inverse of entity resolution — instead of matching existing records, you create them from raw text.

## The 3-Layer Cascade

The engine follows a "Pattern-First, LLM-Last" design principle:

```
Input Text
     │
     ├── Layer 1: Pattern Match ── free, <1ms, ~70% coverage
     │   │ email, phone, URL, date, time, number, boolean
     │   │
     ├── Layer 2: ONNX NER ────── free, <20ms, ~20% coverage
     │   │ GLiNER zero-shot named entity recognition
     │   │
     └── Layer 3: LLM Fallback ── paid, <2s, ~10% coverage
         │ DeepSeek/OpenAI for remaining cases
         │
    ExtractionResult { values, provenance, confidence }
```

Each layer only handles fields that the previous layer couldn't extract. A field matched by pattern never reaches the LLM, keeping costs at zero for the vast majority of real-world text.

## Built-in Patterns

The synchronous `extract()` function uses a registry of built-in pattern matchers:

| Field Type | Pattern | Example |
|---|---|---|
| `email` | RFC 5322 simplified | `john@example.com` |
| `phone` | International + Chinese formats | `+86-138-0000-0000`, `010-1234-5678` |
| `url` | HTTP/HTTPS with auto-protocol | `example.com` → `https://example.com` |
| `number` | Integer, float, scientific, currency, percent | `42`, `3.14`, `$19.99`, `15%` |
| `integer` | Standalone integers only | `42`, `-7`, `1,000` |
| `boolean` | Multi-language (en, zh) | `true`, `false`, `yes`, `no`, `on`, `off` (yes/no in Chinese) |
| `date` | ISO 8601, slash, named months | `2024-01-15`, `Jan 15 2024` |
| `time` | 12h/24h with AM/PM | `14:30`, `2:30 PM`, `02:30:00` |

### Basic Usage

```typescript
import { extract } from '@agentix-e/entity-resolver-extract';
import type { FieldDescriptor, ExtractionResult } from '@agentix-e/entity-resolver-extract';

const text = 'Send the report to alice@company.com by 2026-03-15 or call +1-555-0199';

const fields: FieldDescriptor[] = [
  { name: 'email', type: 'email' },
  { name: 'deadline', type: 'date' },
  { name: 'phone', type: 'phone' },
];

const result: ExtractionResult = extract(text, fields);

console.log(result.values);
// { email: 'alice@company.com', deadline: 2026-03-15T00:00:00.000Z, phone: '+1-555-0199' }

console.log(result.provenance);
// { email: 'pattern', deadline: 'pattern', phone: 'pattern' }

console.log(result.confidence);
// { email: 0.95, deadline: 0.98, phone: 0.95 }
```

## ONNX NER Adapter

For fields without built-in patterns (names, organizations, locations), use the ONNX Named Entity Recognition layer. It runs zero-shot NER locally — no API calls, no data leaves your machine.

```typescript
import { extractAsync } from '@agentix-e/entity-resolver-extract';
import type { FieldDescriptor } from '@agentix-e/entity-resolver-extract';

const text = 'Sarah Chen from OpenAI will present at the Moscone Center in San Francisco';

const fields: FieldDescriptor[] = [
  { name: 'speaker', type: 'string' },
  { name: 'organization', type: 'string' },
  { name: 'venue', type: 'string' },
  { name: 'city', type: 'string' },
];

const result = await extractAsync(text, fields, {
  enableOnnx: true,  // <-- activates ONNX NER layer
});

console.log(result.values);
// Pattern layer misses all fields (no regex for names/orgs)
// ONNX layer handles them with zero-shot NER

console.log(result.provenance);
// { speaker: 'onnx', organization: 'onnx', venue: 'onnx', city: 'onnx' }
```

Check ONNX availability before enabling:

```typescript
import { isOnnxAvailable, getOnnxError } from '@agentix-e/entity-resolver-extract';

if (isOnnxAvailable()) {
  console.log('ONNX runtime ready');
} else {
  console.log('ONNX unavailable:', getOnnxError()?.message);
}
```

## LLM Fallback

When neither patterns nor ONNX can extract a field, the LLM layer provides a final safety net:

```typescript
import { extractAsync } from '@agentix-e/entity-resolver-extract';

const result = await extractAsync(
  'The quarterly report shows a 15% increase in revenue driven by the APAC region',
  [
    { name: 'metric', type: 'string' },
    { name: 'value', type: 'number' },
    { name: 'region', type: 'string' },
  ],
  {
    enableOnnx: true,
    enableLlm: true,  // <-- enables LLM as last resort
  },
);

// Pattern layer extracts: value: 0.15 (15%)
// ONNX extracts: region: 'APAC'
// LLM infers: metric: 'revenue' (semantic understanding needed)
```

## CLI Usage

The `entity-resolver extract` command provides command-line extraction:

```bash
# Basic extraction
entity-resolver extract --text "明天下午3点开会" --fields time:time,date:date,title:string

# Expected output:
# {
#   "values": {
#     "time": "15:00:00",
#     "date": "2026-08-02",
#     "title": "开会"
#   },
#   "provenance": {
#     "time": "pattern",
#     "date": "pattern",
#     "title": "pattern"
#   },
#   "confidence": {
#     "time": 0.90,
#     "date": 0.95,
#     "title": 0.00
#   }
# }
```

### Extract Help Output

```bash
$ entity-resolver extract --help
```

Running the actual CLI:

```
Usage: entity-resolver extract --text "<text>" [--intent <intent>] [--fields field:type,...]
Example: entity-resolver extract --text "明天下午3点开会" --fields time:time,date:date,title:string

Extract options:
  --text "<text>"       Input text to extract entities from
  --fields field:type   Comma-separated field descriptors (e.g. time:time,date:date)
  --intent <intent>     Intent name for enhanced extraction (e.g. alarm, reminder)
```

### Supported CLI Field Types

The `--fields` flag accepts comma-separated `name:type` pairs where type can be:

`string`, `number`, `integer`, `boolean`, `date`, `time`, `datetime`, `email`, `phone`, `url`

## API Usage

### Synchronous Extraction (`extract`)

Pattern matching only — returns immediately, costs nothing:

```typescript
import { extract } from '@agentix-e/entity-resolver-extract';

const result = extract(
  'Order #12345 for $299.99 placed by jane@shop.com on 2026-01-15',
  [
    { name: 'order_id', type: 'integer' },
    { name: 'amount', type: 'number' },
    { name: 'customer_email', type: 'email' },
    { name: 'order_date', type: 'date' },
  ],
);

// result.values = {
//   order_id: 12345,
//   amount: 299.99,
//   customer_email: 'jane@shop.com',
//   order_date: 2026-01-15T00:00:00.000Z
// }
```

### Asynchronous Extraction (`extractAsync`)

Full cascade including ONNX and LLM:

```typescript
import { extractAsync } from '@agentix-e/entity-resolver-extract';

const result = await extractAsync(
  'Meeting with Dr. Patel at Memorial Hospital about the clinical trial results',
  [
    { name: 'contact_name', type: 'string' },
    { name: 'organization', type: 'string' },
    { name: 'topic', type: 'string' },
  ],
  { enableOnnx: true, enableLlm: true },
);
```

### Registration and Type Coercion

Built-in patterns are registered automatically. For coercion of extracted values:

```typescript
import { coerce, coerceAll } from '@agentix-e/entity-resolver-extract';

// Coerce a single value to a target type
const phoneResult = coerce('+1-555-0199', 'phone');
console.log(phoneResult); // { success: true, value: '+1-555-0199' }

// Coerce all extracted values
const rawValues = { count: '42', price: '19.99', active: 'yes' };
const coerced = coerceAll(rawValues, {
  count: 'integer',
  price: 'number',
  active: 'boolean',
});
console.log(coerced); // { count: 42, price: 19.99, active: true }
```

## Temporal Extraction

The `parseTemporal` function handles natural-language date and time expressions in Chinese, Japanese, Korean, and English:

### Western Dates

```typescript
import { parseTemporal } from '@agentix-e/entity-resolver-extract';

const results = parseTemporal('Submit by January 15, 2026');
console.log(results[0]);
// { date: '2026-01-15', confidence: 0.9, granularity: 'day' }
```

### CJK Dates

```typescript
const results = parseTemporal('2024年1月15日下午3点开会');
console.log(results);
// [
//   { date: '2024-01-15', time: null, confidence: 0.95, granularity: 'day' },
//   { date: null, time: '15:00:00', confidence: 0.90, granularity: 'hour' }
// ]
```

### Relative Expressions

```typescript
const results = parseTemporal('明天下午两点', { referenceDate: new Date('2026-08-01') });
console.log(results[0]);
// { date: '2026-08-02', time: '14:00:00', confidence: 0.95, granularity: 'day' }
```

### Lunar Calendar

```typescript
const results = parseTemporal('农历正月初一');
console.log(results[0]);
// { date: '2026-02-17', confidence: 0.7, granularity: 'day' }
```

### Japanese Era Names

```typescript
const results = parseTemporal('令和6年1月15日');
console.log(results[0]);
// { date: '2024-01-15', confidence: 0.95, granularity: 'day' }
```

### Korean Dangi Calendar

```typescript
const results = parseTemporal('단기 4357년');
console.log(results[0]);
// { date: '2024-01-01', confidence: 0.8, granularity: 'year' }
```

## Complete Example: Intent-Enhanced Extraction

Use intent context to boost extraction accuracy for specific domains:

```typescript
import { extract, applyDefaults } from '@agentix-e/entity-resolver-extract';
import type { FieldDescriptor } from '@agentix-e/entity-resolver-extract';

// Intent-enhanced alarm extraction
const text = '明天早上7点叫我起床';

const fields: FieldDescriptor[] = [
  { name: 'time', type: 'time' },
  { name: 'date', type: 'date' },
  { name: 'label', type: 'string' },
];

const result = extract(text, fields, { intent: 'alarm' });

console.log(result.values);
// {
//   time: '07:00:00',
//   date: new Date('2026-08-02'),  // tomorrow
//   label: '起床'                    // extracted from remaining text
// }

console.log(result.provenance);
// { time: 'pattern', date: 'pattern', label: 'pattern' }

console.log(result.confidence);
// { time: 0.90, date: 0.95, label: 0.85 }
```

### Slot Inheritance Across Conversational Turns

```typescript
import { extract, inheritSlots, buildExtractionContext } from '@agentix-e/entity-resolver-extract';

// Turn 1: Set an alarm
const turn1 = extract('明天上午8点开会', [
  { name: 'date', type: 'date' },
  { name: 'time', type: 'time' },
  { name: 'label', type: 'string' },
], { intent: 'alarm' });

// Turn 2: Modify only the time
const ctx = buildExtractionContext(turn1.values, turn1.confidence, turn1.provenance);
const turn2 = extract('改为9点', [
  { name: 'date', type: 'date' },
  { name: 'time', type: 'time' },
  { name: 'label', type: 'string' },
], {
  intent: 'alarm',
  previousContext: ctx,
});

console.log(turn2.values);
// { date: '2026-08-02', time: '09:00:00', label: '开会' }
// Date and label inherited from turn 1, time updated from turn 2
```

## Custom Pattern Registration

Extend the built-in registry with your own patterns:

```typescript
import { PatternRegistry, registerBuiltins } from '@agentix-e/entity-resolver-extract';

const registry = new PatternRegistry();
registerBuiltins(registry);

// Register a custom order ID pattern
registry.register('order_id', {
  name: 'order_id',
  extract(text: string) {
    const match = /\bORD-\d{6}\b/.exec(text);
    if (!match) return [];
    return [{
      value: match[0],
      confidence: 0.98,
      matchedText: match[0],
      offset: match.index,
    }];
  },
}, 10); // Higher priority than built-ins (default: 0)

// Use the custom registry
import { extract } from '@agentix-e/entity-resolver-extract';

const result = extract(
  'Your order ORD-123456 has shipped',
  [
    { name: 'order_id', type: 'string' },
    { name: 'status', type: 'string' },
  ],
  { registry },
);
```
