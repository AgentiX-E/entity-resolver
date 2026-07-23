## Classes

### TFAdjustmentLookup

Defined in: [fellegi-sunter/tf-adjust.ts:97](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L97)

Pre-computed TF adjustment lookup for batch processing.

#### Constructors

##### Constructor

```ts
new TFAdjustmentLookup(frequencies): TFAdjustmentLookup;
```

Defined in: [fellegi-sunter/tf-adjust.ts:100](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L100)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `frequencies` | `Map`\<`string`, [`TermFrequency`](#termfrequency)[]\> |

###### Returns

[`TFAdjustmentLookup`](#tfadjustmentlookup)

#### Methods

##### getAdjustment()

```ts
getAdjustment(field, value): number;
```

Defined in: [fellegi-sunter/tf-adjust.ts:115](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L115)

Get the TF adjustment factor for a field-value pair.
Returns 1.0 (no adjustment) if the value is not in the lookup.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `string` |
| `value` | `unknown` |

###### Returns

`number`

***

### MemoryEntityStore

Defined in: [memory/entity-store.ts:6](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/memory/entity-store.ts#L6)

#### Constructors

##### Constructor

```ts
new MemoryEntityStore(): MemoryEntityStore;
```

###### Returns

[`MemoryEntityStore`](#memoryentitystore)

#### Methods

##### getEntity()

```ts
getEntity(id): Promise<
  | {
  clusterId: string;
  memberIds: number[];
  cohesion: number;
}
| null>;
```

Defined in: [memory/entity-store.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/memory/entity-store.ts#L9)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<
  \| \{
  `clusterId`: `string`;
  `memberIds`: `number`[];
  `cohesion`: `number`;
\}
  \| `null`\>

##### queryNeighbors()

```ts
queryNeighbors(id, _hops?): Promise<{
  clusterId: string;
  memberIds: number[];
  cohesion: number;
}[]>;
```

Defined in: [memory/entity-store.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/memory/entity-store.ts#L14)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `_hops?` | `number` |

###### Returns

`Promise`\<\{
  `clusterId`: `string`;
  `memberIds`: `number`[];
  `cohesion`: `number`;
\}[]\>

##### upsertEntity()

```ts
upsertEntity(entity): Promise<void>;
```

Defined in: [memory/entity-store.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/memory/entity-store.ts#L19)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | \{ `clusterId`: `string`; `memberIds`: `number`[]; `cohesion`: `number`; \} |
| `entity.clusterId` | `string` |
| `entity.memberIds` | `number`[] |
| `entity.cohesion` | `number` |

###### Returns

`Promise`\<`void`\>

##### deleteEntity()

```ts
deleteEntity(id): Promise<void>;
```

Defined in: [memory/entity-store.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/memory/entity-store.ts#L23)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<`void`\>

##### applyMerge()

```ts
applyMerge(from, into): Promise<void>;
```

Defined in: [memory/entity-store.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/memory/entity-store.ts#L27)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `from` | `string` |
| `into` | `string` |

###### Returns

`Promise`\<`void`\>

##### applySplit()

```ts
applySplit(entityId, memberGroups): Promise<void>;
```

Defined in: [memory/entity-store.ts:36](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/memory/entity-store.ts#L36)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityId` | `string` |
| `memberGroups` | `string`[][] |

###### Returns

`Promise`\<`void`\>

***

### BloomFilter

Defined in: [pprl/bloom.ts:20](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L20)

Encoded Bloom filter representation.

#### Constructors

##### Constructor

```ts
new BloomFilter(size, numHashes): BloomFilter;
```

Defined in: [pprl/bloom.ts:25](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L25)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `size` | `number` |
| `numHashes` | `number` |

###### Returns

[`BloomFilter`](#bloomfilter)

#### Properties

##### bits

```ts
readonly bits: Uint8Array;
```

Defined in: [pprl/bloom.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L21)

##### size

```ts
readonly size: number;
```

Defined in: [pprl/bloom.ts:22](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L22)

##### numHashes

```ts
readonly numHashes: number;
```

Defined in: [pprl/bloom.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L23)

#### Methods

##### add()

```ts
add(token, secret): void;
```

Defined in: [pprl/bloom.ts:32](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L32)

Add a token to the Bloom filter.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `token` | `string` |
| `secret` | `string` |

###### Returns

`void`

##### similarity()

```ts
similarity(other): number;
```

Defined in: [pprl/bloom.ts:46](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L46)

Compute Dice coefficient similarity with another Bloom filter.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `other` | [`BloomFilter`](#bloomfilter) |

###### Returns

`number`

##### toHex()

```ts
toHex(): string;
```

Defined in: [pprl/bloom.ts:60](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L60)

Export as hex string for transmission.

###### Returns

`string`

##### fromHex()

```ts
static fromHex(
   hex, 
   size, 
   numHashes): BloomFilter;
```

Defined in: [pprl/bloom.ts:65](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L65)

Import from hex string.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `hex` | `string` |
| `size` | `number` |
| `numHashes` | `number` |

###### Returns

[`BloomFilter`](#bloomfilter)

## Interfaces

### LabeledPair

Defined in: [active-learning/learner.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L11)

A labeled pair: match (1) or non-match (0).

#### Properties

##### leftId

```ts
readonly leftId: number;
```

Defined in: [active-learning/learner.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L12)

##### rightId

```ts
readonly rightId: number;
```

Defined in: [active-learning/learner.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L13)

##### label

```ts
readonly label: number;
```

Defined in: [active-learning/learner.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L14)

***

### ActiveLearningSession

Defined in: [active-learning/learner.ts:18](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L18)

Active learning session state.

#### Properties

##### labeledPairs

```ts
readonly labeledPairs: LabeledPair[];
```

Defined in: [active-learning/learner.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L19)

##### unlabeledPairs

```ts
readonly unlabeledPairs: ScoredPair[];
```

Defined in: [active-learning/learner.ts:20](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L20)

##### iteration

```ts
readonly iteration: number;
```

Defined in: [active-learning/learner.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L21)

##### classifier

```ts
readonly classifier: LogisticClassifier | null;
```

Defined in: [active-learning/learner.ts:22](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L22)

##### converged

```ts
readonly converged: boolean;
```

Defined in: [active-learning/learner.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L23)

***

### LogisticClassifier

Defined in: [active-learning/learner.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L27)

Logistic regression classifier for match prediction.

#### Properties

##### weights

```ts
readonly weights: readonly number[];
```

Defined in: [active-learning/learner.ts:28](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L28)

##### bias

```ts
readonly bias: number;
```

Defined in: [active-learning/learner.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L29)

##### accuracy

```ts
readonly accuracy: number;
```

Defined in: [active-learning/learner.ts:30](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L30)

***

### DetectedField

Defined in: [auto-config/detector.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L26)

Detected field metadata.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [auto-config/detector.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L27)

##### semanticType

```ts
readonly semanticType: SemanticType;
```

Defined in: [auto-config/detector.ts:28](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L28)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [auto-config/detector.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L29)

##### cardinality

```ts
readonly cardinality: number;
```

Defined in: [auto-config/detector.ts:30](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L30)

##### nullRatio

```ts
readonly nullRatio: number;
```

Defined in: [auto-config/detector.ts:31](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L31)

##### isNumeric

```ts
readonly isNumeric: boolean;
```

Defined in: [auto-config/detector.ts:32](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L32)

##### avgLength

```ts
readonly avgLength: number;
```

Defined in: [auto-config/detector.ts:33](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L33)

##### sampleValues

```ts
readonly sampleValues: readonly string[];
```

Defined in: [auto-config/detector.ts:34](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L34)

***

### AutoConfigResult

Defined in: [auto-config/detector.ts:38](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L38)

Complete auto-configuration result.

#### Properties

##### fields

```ts
readonly fields: readonly DetectedField[];
```

Defined in: [auto-config/detector.ts:39](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L39)

##### config

```ts
readonly config: PipelineConfig;
```

Defined in: [auto-config/detector.ts:40](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L40)

##### confidence

```ts
readonly confidence: number;
```

Defined in: [auto-config/detector.ts:41](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L41)

##### warnings

```ts
readonly warnings: readonly string[];
```

Defined in: [auto-config/detector.ts:42](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L42)

***

### BenchmarkDataset

Defined in: [benchmarks/datasets.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L8)

A benchmark dataset with records and ground truth clusters.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [benchmarks/datasets.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L9)

##### description

```ts
readonly description: string;
```

Defined in: [benchmarks/datasets.ts:10](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L10)

##### recordCount

```ts
readonly recordCount: number;
```

Defined in: [benchmarks/datasets.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L11)

##### trueMatchCount

```ts
readonly trueMatchCount: number;
```

Defined in: [benchmarks/datasets.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L12)

##### records

```ts
readonly records: RawRecord[];
```

Defined in: [benchmarks/datasets.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L13)

##### groundTruth

```ts
readonly groundTruth: Map<string, number[]>;
```

Defined in: [benchmarks/datasets.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L14)

***

### BenchmarkResult

Defined in: [benchmarks/datasets.ts:18](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L18)

Result of running a benchmark.

#### Properties

##### dataset

```ts
readonly dataset: string;
```

Defined in: [benchmarks/datasets.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L19)

##### recordCount

```ts
readonly recordCount: number;
```

Defined in: [benchmarks/datasets.ts:20](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L20)

##### trueMatchCount

```ts
readonly trueMatchCount: number;
```

Defined in: [benchmarks/datasets.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L21)

##### foundMatchCount

```ts
readonly foundMatchCount: number;
```

Defined in: [benchmarks/datasets.ts:22](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L22)

##### purity

```ts
readonly purity: number;
```

Defined in: [benchmarks/datasets.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L23)

##### completeness

```ts
readonly completeness: number;
```

Defined in: [benchmarks/datasets.ts:24](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L24)

##### executionTimeMs

```ts
readonly executionTimeMs: number;
```

Defined in: [benchmarks/datasets.ts:25](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L25)

***

### BlockingAnalysisResult

Defined in: [blocking/analyzer.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L9)

Result of blocking rule analysis.

#### Properties

##### estimatedPairCount

```ts
readonly estimatedPairCount: number;
```

Defined in: [blocking/analyzer.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L11)

Estimated number of pairs this rule will generate (sampling-based).

##### estimatedReductionRatio

```ts
readonly estimatedReductionRatio: number;
```

Defined in: [blocking/analyzer.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L13)

Reduction ratio estimate.

##### hasSkewedBlocks

```ts
readonly hasSkewedBlocks: boolean;
```

Defined in: [blocking/analyzer.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L15)

Whether any blocks are skewed (one block dominates).

##### maxBlockRatio

```ts
readonly maxBlockRatio: number;
```

Defined in: [blocking/analyzer.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L17)

The size ratio of the largest block vs average.

##### warning?

```ts
readonly optional warning?: string;
```

Defined in: [blocking/analyzer.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L19)

Human-readable warning if skew is detected.

***

### CandidatePair

Defined in: [blocking/types.ts:7](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L7)

A candidate pair of record IDs to be compared in the matching phase.

#### Properties

##### leftId

```ts
readonly leftId: number;
```

Defined in: [blocking/types.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L8)

##### rightId

```ts
readonly rightId: number;
```

Defined in: [blocking/types.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L9)

***

### BlockingConfig

Defined in: [blocking/types.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L13)

Configuration for a blocking strategy.

#### Properties

##### fields?

```ts
readonly optional fields?: readonly string[];
```

Defined in: [blocking/types.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L15)

Fields to block on.

##### passes?

```ts
readonly optional passes?: readonly BlockingPass[];
```

Defined in: [blocking/types.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L17)

Number of passes for multi-pass strategies.

##### windowSize?

```ts
readonly optional windowSize?: number;
```

Defined in: [blocking/types.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L19)

Window size for sorted neighborhood.

##### transforms?

```ts
readonly optional transforms?: readonly BlockingTransform[];
```

Defined in: [blocking/types.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L21)

Transforms to apply to blocking keys.

***

### BlockingPass

Defined in: [blocking/types.ts:25](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L25)

A single blocking pass in a multi-pass strategy.

#### Properties

##### fields

```ts
readonly fields: readonly string[];
```

Defined in: [blocking/types.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L26)

##### transforms

```ts
readonly transforms: readonly BlockingTransform[];
```

Defined in: [blocking/types.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L27)

***

### BlockingResult

Defined in: [blocking/types.ts:43](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L43)

Result of a blocking operation.

#### Properties

##### pairs

```ts
readonly pairs: readonly CandidatePair[];
```

Defined in: [blocking/types.ts:45](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L45)

Candidate pairs generated.

##### totalRecords

```ts
readonly totalRecords: number;
```

Defined in: [blocking/types.ts:47](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L47)

Total records processed.

##### reductionRatio

```ts
readonly reductionRatio: number;
```

Defined in: [blocking/types.ts:49](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L49)

Reduction ratio: 1 - (pairs / (n*(n-1)/2)).

##### blockCount

```ts
readonly blockCount: number;
```

Defined in: [blocking/types.ts:51](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L51)

This many clusters (blocks) were created.

***

### ClusteringResult

Defined in: [clustering/algorithms.ts:6](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L6)

#### Properties

##### clusters

```ts
readonly clusters: ReadonlyMap<string, Cluster>;
```

Defined in: [clustering/algorithms.ts:7](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L7)

##### singletons

```ts
readonly singletons: readonly number[];
```

Defined in: [clustering/algorithms.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L8)

##### metadata

```ts
readonly metadata: ClusteringMetadata;
```

Defined in: [clustering/algorithms.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L9)

***

### ClusteringMetadata

Defined in: [clustering/algorithms.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L12)

#### Properties

##### numClusters

```ts
readonly numClusters: number;
```

Defined in: [clustering/algorithms.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L13)

##### numSingletons

```ts
readonly numSingletons: number;
```

Defined in: [clustering/algorithms.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L14)

##### averageClusterSize

```ts
readonly averageClusterSize: number;
```

Defined in: [clustering/algorithms.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L15)

##### maxClusterSize

```ts
readonly maxClusterSize: number;
```

Defined in: [clustering/algorithms.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L16)

##### totalRecords

```ts
readonly totalRecords: number;
```

Defined in: [clustering/algorithms.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L17)

***

### EvaluationMetrics

Defined in: [evaluation/metrics.ts:10](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L10)

Complete evaluation metrics for a clustering result.

#### Properties

##### pairwisePrecision

```ts
readonly pairwisePrecision: number;
```

Defined in: [evaluation/metrics.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L12)

##### pairwiseRecall

```ts
readonly pairwiseRecall: number;
```

Defined in: [evaluation/metrics.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L13)

##### pairwiseF1

```ts
readonly pairwiseF1: number;
```

Defined in: [evaluation/metrics.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L14)

##### clusterPrecision

```ts
readonly clusterPrecision: number;
```

Defined in: [evaluation/metrics.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L17)

##### clusterRecall

```ts
readonly clusterRecall: number;
```

Defined in: [evaluation/metrics.ts:18](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L18)

##### clusterF1

```ts
readonly clusterF1: number;
```

Defined in: [evaluation/metrics.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L19)

##### bCubedPrecision

```ts
readonly bCubedPrecision: number;
```

Defined in: [evaluation/metrics.ts:22](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L22)

##### bCubedRecall

```ts
readonly bCubedRecall: number;
```

Defined in: [evaluation/metrics.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L23)

##### bCubedF1

```ts
readonly bCubedF1: number;
```

Defined in: [evaluation/metrics.ts:24](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L24)

##### adjustedRandIndex

```ts
readonly adjustedRandIndex: number;
```

Defined in: [evaluation/metrics.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L27)

##### fowlkesMallowsIndex

```ts
readonly fowlkesMallowsIndex: number;
```

Defined in: [evaluation/metrics.ts:28](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L28)

##### vMeasure

```ts
readonly vMeasure: number;
```

Defined in: [evaluation/metrics.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L29)

##### clusterHomogeneity

```ts
readonly clusterHomogeneity: number;
```

Defined in: [evaluation/metrics.ts:32](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L32)

##### clusterCompleteness

```ts
readonly clusterCompleteness: number;
```

Defined in: [evaluation/metrics.ts:33](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L33)

##### numPredictedClusters

```ts
readonly numPredictedClusters: number;
```

Defined in: [evaluation/metrics.ts:36](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L36)

##### numReferenceClusters

```ts
readonly numReferenceClusters: number;
```

Defined in: [evaluation/metrics.ts:37](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L37)

##### totalRecords

```ts
readonly totalRecords: number;
```

Defined in: [evaluation/metrics.ts:38](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L38)

***

### EMOptions

Defined in: [fellegi-sunter/em.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L9)

Configuration for the EM algorithm.

#### Properties

##### maxIterations?

```ts
readonly optional maxIterations?: number;
```

Defined in: [fellegi-sunter/em.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L11)

Maximum number of iterations (default: 30).

##### epsilon?

```ts
readonly optional epsilon?: number;
```

Defined in: [fellegi-sunter/em.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L13)

Convergence threshold: stop when delta log-likelihood < epsilon.

##### seed?

```ts
readonly optional seed?: number;
```

Defined in: [fellegi-sunter/em.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L15)

Random seed for reproducibility.

***

### EMResult

Defined in: [fellegi-sunter/em.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L19)

Result of EM parameter estimation.

#### Properties

##### parameters

```ts
readonly parameters: FSParameters;
```

Defined in: [fellegi-sunter/em.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L21)

Estimated FS parameters.

##### iterations

```ts
readonly iterations: number;
```

Defined in: [fellegi-sunter/em.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L23)

Number of iterations performed.

##### converged

```ts
readonly converged: boolean;
```

Defined in: [fellegi-sunter/em.ts:25](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L25)

Whether the algorithm converged (vs hit maxIterations).

##### logLikelihood

```ts
readonly logLikelihood: number;
```

Defined in: [fellegi-sunter/em.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L27)

Final log-likelihood.

##### logLikelihoodHistory

```ts
readonly logLikelihoodHistory: readonly number[];
```

Defined in: [fellegi-sunter/em.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L29)

History of log-likelihoods per iteration.

***

### CorrelationWarning

Defined in: [fellegi-sunter/field-independence.ts:7](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L7)

Correlation warning for a pair of fields.

#### Properties

##### fieldA

```ts
readonly fieldA: string;
```

Defined in: [fellegi-sunter/field-independence.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L8)

##### fieldB

```ts
readonly fieldB: string;
```

Defined in: [fellegi-sunter/field-independence.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L9)

##### cramersV

```ts
readonly cramersV: number;
```

Defined in: [fellegi-sunter/field-independence.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L11)

Cramér's V measure of association (0 = independent, 1 = perfect association).

##### severity

```ts
readonly severity: "low" | "medium" | "high";
```

Defined in: [fellegi-sunter/field-independence.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L13)

Severity of the correlation violation.

***

### CorrelationReport

Defined in: [fellegi-sunter/field-independence.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L19)

Complete field correlation report.

#### Properties

##### warnings

```ts
readonly warnings: readonly CorrelationWarning[];
```

Defined in: [fellegi-sunter/field-independence.ts:20](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L20)

##### hasSevereViolations

```ts
readonly hasSevereViolations: boolean;
```

Defined in: [fellegi-sunter/field-independence.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L21)

***

### MatchWeightResult

Defined in: [fellegi-sunter/match-weight.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L11)

Result of match weight calculation for a pair of records.

#### Properties

##### priorWeight

```ts
readonly priorWeight: number;
```

Defined in: [fellegi-sunter/match-weight.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L13)

Prior weight: log2(lambda / (1 - lambda)).

##### fieldWeights

```ts
readonly fieldWeights: ReadonlyMap<string, number>;
```

Defined in: [fellegi-sunter/match-weight.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L15)

Per-field match weights { fieldName: weight }.

##### totalWeight

```ts
readonly totalWeight: number;
```

Defined in: [fellegi-sunter/match-weight.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L17)

Total match weight: prior + sum(fieldWeights).

##### probability

```ts
readonly probability: number;
```

Defined in: [fellegi-sunter/match-weight.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L19)

Match probability derived from totalWeight: 2^M / (1 + 2^M).

***

### FSParameters

Defined in: [fellegi-sunter/parameters.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L13)

Fellegi-Sunter model parameters.

m-probability: P(observation | records match) — measures data quality/reliability
u-probability: P(observation | records do not match) — measures coincidence/cardinality
lambda: P(match) — prior probability that any two records match

#### Properties

##### lambda

```ts
readonly lambda: number;
```

Defined in: [fellegi-sunter/parameters.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L15)

Prior match probability. Range: (0, 1).

##### mProbabilities

```ts
readonly mProbabilities: ReadonlyMap<string, number>;
```

Defined in: [fellegi-sunter/parameters.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L21)

m-probabilities keyed by "field:level".
E.g., "name:exact_match" => 0.95 means: when records match,
there's a 95% chance the name field is an exact match.

##### uProbabilities

```ts
readonly uProbabilities: ReadonlyMap<string, number>;
```

Defined in: [fellegi-sunter/parameters.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L27)

u-probabilities keyed by "field:level".
E.g., "name:exact_match" => 0.01 means: when records DON'T match,
there's only a 1% chance the name field coincidentally matches exactly.

***

### TermFrequency

Defined in: [fellegi-sunter/tf-adjust.ts:7](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L7)

Term frequency statistics for a single field-value pair.

#### Properties

##### field

```ts
readonly field: string;
```

Defined in: [fellegi-sunter/tf-adjust.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L9)

The field name.

##### value

```ts
readonly value: string;
```

Defined in: [fellegi-sunter/tf-adjust.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L11)

The value being analyzed.

##### frequency

```ts
readonly frequency: number;
```

Defined in: [fellegi-sunter/tf-adjust.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L13)

How many times this value appears in the dataset.

##### totalRecords

```ts
readonly totalRecords: number;
```

Defined in: [fellegi-sunter/tf-adjust.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L15)

Total number of records in the dataset.

##### ratio

```ts
readonly ratio: number;
```

Defined in: [fellegi-sunter/tf-adjust.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L17)

Frequency ratio: frequency / totalRecords.

***

### IScorer

Defined in: [interfaces/IScorer.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/interfaces/IScorer.ts#L14)

A scoring function that computes similarity between two field values.
All implementations return a score in [0, 1] where 1.0 means perfect match.

Implemented by:
  - Pure JS scorers (scorers/js/) — always available
  - WASM scorers (scorers/wasm/) — auto-detected, ~5x faster

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [interfaces/IScorer.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/interfaces/IScorer.ts#L16)

Unique name of this scorer (e.g., "levenshtein", "jaro_winkler").

##### kernelized

```ts
readonly kernelized: boolean;
```

Defined in: [interfaces/IScorer.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/interfaces/IScorer.ts#L26)

Whether this scorer uses WASM acceleration (false for pure JS).

#### Methods

##### score()

```ts
score(
   a, 
   b, 
   field): number;
```

Defined in: [interfaces/IScorer.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/interfaces/IScorer.ts#L23)

Compute similarity between two field values.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `unknown` |
| `b` | `unknown` |
| `field` | [`FieldMetadata`](#fieldmetadata) |

###### Returns

`number`

A score in [0, 1]. 1.0 = perfect match, 0.0 = completely different.

###### Throws

Never — scorers must handle all input gracefully and return 0 for edge cases.

***

### LLMScorerConfig

Defined in: [llm/scorer.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L8)

LLM scorer configuration.

#### Properties

##### candidateLo

```ts
readonly candidateLo: number;
```

Defined in: [llm/scorer.ts:10](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L10)

Minimum score threshold to consider for LLM review.

##### candidateHi

```ts
readonly candidateHi: number;
```

Defined in: [llm/scorer.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L12)

Maximum score threshold. Pairs in [lo, hi] are sent to LLM.

##### apiBaseUrl?

```ts
readonly optional apiBaseUrl?: string;
```

Defined in: [llm/scorer.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L14)

API base URL. Default: DeepSeek API.

##### model?

```ts
readonly optional model?: string;
```

Defined in: [llm/scorer.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L16)

Model name. Default: deepseek-chat.

##### maxTokens?

```ts
readonly optional maxTokens?: number;
```

Defined in: [llm/scorer.ts:18](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L18)

Max tokens for LLM response.

***

### LLMScorerResult

Defined in: [llm/scorer.ts:22](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L22)

Result from LLM scoring a record pair.

#### Properties

##### leftId

```ts
readonly leftId: number;
```

Defined in: [llm/scorer.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L23)

##### rightId

```ts
readonly rightId: number;
```

Defined in: [llm/scorer.ts:24](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L24)

##### originalScore

```ts
readonly originalScore: number;
```

Defined in: [llm/scorer.ts:25](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L25)

##### llmScore

```ts
readonly llmScore: number;
```

Defined in: [llm/scorer.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L26)

##### reasoning

```ts
readonly reasoning: string;
```

Defined in: [llm/scorer.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L27)

***

### ComparisonLevel

Defined in: [matching/comparison.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L8)

A single comparison level with a threshold.

#### Properties

##### label

```ts
readonly label: string;
```

Defined in: [matching/comparison.ts:10](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L10)

Label for diagnostics (e.g., "exact_match", "levenshtein<2").

##### threshold

```ts
readonly threshold: number;
```

Defined in: [matching/comparison.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L12)

Score threshold for this level. Values >= threshold are assigned to this level.

***

### ComparisonSpec

Defined in: [matching/comparison.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L16)

Configuration for comparing a single field.

#### Properties

##### field

```ts
readonly field: string;
```

Defined in: [matching/comparison.ts:18](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L18)

The field being compared.

##### scorerName

```ts
readonly scorerName: string;
```

Defined in: [matching/comparison.ts:20](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L20)

Scorer name (from registry).

##### levels

```ts
readonly levels: readonly ComparisonLevel[];
```

Defined in: [matching/comparison.ts:22](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L22)

Ordered comparison levels (first match wins).

***

### ComparisonVector

Defined in: [matching/comparison.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L29)

A comparison vector — the comparison result for a single field
between two records.

#### Properties

##### field

```ts
readonly field: string;
```

Defined in: [matching/comparison.ts:31](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L31)

Field name.

##### level

```ts
readonly level: string;
```

Defined in: [matching/comparison.ts:33](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L33)

The comparison level that matched (first level whose threshold was met).

##### score

```ts
readonly score: number;
```

Defined in: [matching/comparison.ts:35](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L35)

The raw similarity score.

##### scorer

```ts
readonly scorer: string;
```

Defined in: [matching/comparison.ts:37](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L37)

The scorer used.

***

### PipelineConfig

Defined in: [pipeline/runner.ts:25](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L25)

Pipeline configuration.

#### Properties

##### blocking

```ts
readonly blocking: BlockingConfig;
```

Defined in: [pipeline/runner.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L27)

Blocking strategy configuration.

##### comparisons

```ts
readonly comparisons: readonly ComparisonSpec[];
```

Defined in: [pipeline/runner.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L29)

Comparison specs for matching.

##### matchThreshold

```ts
readonly matchThreshold: number;
```

Defined in: [pipeline/runner.ts:31](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L31)

Match threshold for clustering.

##### tfFields?

```ts
readonly optional tfFields?: readonly string[];
```

Defined in: [pipeline/runner.ts:33](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L33)

Fields to use for term frequency adjustment.

##### autoConfigure?

```ts
readonly optional autoConfigure?: boolean;
```

Defined in: [pipeline/runner.ts:35](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L35)

Whether to run auto-configure (simplified in I5).

***

### PipelineOptions

Defined in: [pipeline/runner.ts:39](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L39)

Pipeline execution options.

#### Properties

##### maxEmIterations?

```ts
readonly optional maxEmIterations?: number;
```

Defined in: [pipeline/runner.ts:41](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L41)

Maximum EM iterations.

##### emEpsilon?

```ts
readonly optional emEpsilon?: number;
```

Defined in: [pipeline/runner.ts:43](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L43)

EM convergence epsilon.

***

### PPRLConfig

Defined in: [pprl/bloom.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L8)

PPRL configuration for Bloom filter encoding.

#### Properties

##### filterSize?

```ts
readonly optional filterSize?: number;
```

Defined in: [pprl/bloom.ts:10](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L10)

Bloom filter size in bits. Default: 1024. Larger = more secure, slower.

##### numHashes?

```ts
readonly optional numHashes?: number;
```

Defined in: [pprl/bloom.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L12)

Number of hash functions. Default: 15. More = lower false positive rate.

##### secretKey

```ts
readonly secretKey: string;
```

Defined in: [pprl/bloom.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L14)

Secret key for salted hashing. Must be shared between matching parties.

##### qgramSize?

```ts
readonly optional qgramSize?: number;
```

Defined in: [pprl/bloom.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L16)

Q-gram size for tokenization. Default: 2 (bigrams).

***

### FieldMetadata

Defined in: [types/core.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L14)

Metadata describing a data field.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [types/core.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L16)

Field name as it appears in the data source.

##### semanticType

```ts
readonly semanticType: string;
```

Defined in: [types/core.ts:18](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L18)

Detected semantic type (e.g., "email", "name", "date").

##### cardinality

```ts
readonly cardinality: number;
```

Defined in: [types/core.ts:20](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L20)

Number of distinct values observed in sample.

##### isNumeric

```ts
readonly isNumeric: boolean;
```

Defined in: [types/core.ts:22](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L22)

Whether the field appears to contain numeric data.

***

### ScoredPair

Defined in: [types/core.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L26)

A scored candidate pair produced by the matching phase.

#### Properties

##### leftId

```ts
readonly leftId: number;
```

Defined in: [types/core.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L27)

##### rightId

```ts
readonly rightId: number;
```

Defined in: [types/core.ts:28](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L28)

##### score

```ts
readonly score: number;
```

Defined in: [types/core.ts:30](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L30)

Aggregate similarity score in [0, 1].

##### probability?

```ts
readonly optional probability?: number;
```

Defined in: [types/core.ts:32](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L32)

Match probability from the Fellegi-Sunter model, if available.

***

### Cluster

Defined in: [types/core.ts:36](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L36)

A cluster of records representing one real-world entity.

#### Properties

##### clusterId

```ts
readonly clusterId: string;
```

Defined in: [types/core.ts:37](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L37)

##### memberIds

```ts
readonly memberIds: number[];
```

Defined in: [types/core.ts:38](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L38)

##### cohesion

```ts
readonly cohesion: number;
```

Defined in: [types/core.ts:40](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L40)

Average pairwise similarity within the cluster.

***

### PipelineResult

Defined in: [types/core.ts:44](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L44)

The complete result of an entity resolution run.

#### Properties

##### clusters

```ts
readonly clusters: ReadonlyMap<string, Cluster>;
```

Defined in: [types/core.ts:45](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L45)

##### scoredPairs

```ts
readonly scoredPairs: readonly ScoredPair[];
```

Defined in: [types/core.ts:46](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L46)

##### singletons

```ts
readonly singletons: readonly number[];
```

Defined in: [types/core.ts:47](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L47)

##### statistics

```ts
readonly statistics: PipelineStatistics;
```

Defined in: [types/core.ts:48](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L48)

##### diagnostics

```ts
readonly diagnostics: DiagnosticData;
```

Defined in: [types/core.ts:49](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L49)

***

### PipelineStatistics

Defined in: [types/core.ts:53](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L53)

Summary statistics for a pipeline run.

#### Properties

##### totalRecords

```ts
readonly totalRecords: number;
```

Defined in: [types/core.ts:54](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L54)

##### totalClusters

```ts
readonly totalClusters: number;
```

Defined in: [types/core.ts:55](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L55)

##### matchedRecords

```ts
readonly matchedRecords: number;
```

Defined in: [types/core.ts:56](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L56)

##### matchRate

```ts
readonly matchRate: number;
```

Defined in: [types/core.ts:57](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L57)

##### averageClusterSize

```ts
readonly averageClusterSize: number;
```

Defined in: [types/core.ts:58](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L58)

##### maxClusterSize

```ts
readonly maxClusterSize: number;
```

Defined in: [types/core.ts:59](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L59)

##### executionTimeMs

```ts
readonly executionTimeMs: number;
```

Defined in: [types/core.ts:60](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L60)

***

### DiagnosticData

Defined in: [types/core.ts:64](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L64)

Diagnostic data for model introspection.

#### Properties

##### muParameters

```ts
readonly muParameters: ReadonlyMap<string, FieldMuParams>;
```

Defined in: [types/core.ts:66](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L66)

Per-field m/u parameters from the Fellegi-Sunter model.

##### matchWeightDistribution

```ts
readonly matchWeightDistribution: readonly MatchWeightBin[];
```

Defined in: [types/core.ts:68](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L68)

Match weight distribution across all candidate pairs.

##### unlinkableCount

```ts
readonly unlinkableCount: number;
```

Defined in: [types/core.ts:70](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L70)

Pairs that were blocked but scored below threshold.

***

### FieldMuParams

Defined in: [types/core.ts:74](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L74)

m-probability and u-probability for a single field.

#### Properties

##### mProbabilities

```ts
readonly mProbabilities: ReadonlyMap<string, number>;
```

Defined in: [types/core.ts:75](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L75)

##### uProbabilities

```ts
readonly uProbabilities: ReadonlyMap<string, number>;
```

Defined in: [types/core.ts:76](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L76)

***

### MatchWeightBin

Defined in: [types/core.ts:80](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L80)

A histogram bin for match weight distribution.

#### Properties

##### minWeight

```ts
readonly minWeight: number;
```

Defined in: [types/core.ts:81](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L81)

##### maxWeight

```ts
readonly maxWeight: number;
```

Defined in: [types/core.ts:82](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L82)

##### count

```ts
readonly count: number;
```

Defined in: [types/core.ts:83](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L83)

## Type Aliases

### SemanticType

```ts
type SemanticType = 
  | "email"
  | "phone"
  | "name"
  | "surname"
  | "address"
  | "city"
  | "postcode"
  | "date"
  | "company"
  | "product"
  | "numeric"
  | "identifier"
  | "text";
```

Defined in: [auto-config/detector.ts:10](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L10)

Semantic type inferred for a field.

***

### BlockingTransform

```ts
type BlockingTransform = 
  | "lowercase"
  | "uppercase"
  | "strip"
  | "digits_only"
  | "alpha_only"
  | "soundex"
  | "substring:0:3"
  | "substring:0:1"
  | "metaphone";
```

Defined in: [blocking/types.ts:31](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L31)

Transforms applied to blocking key values.

***

### ScorerFactory

```ts
type ScorerFactory = () => IScorer;
```

Defined in: [interfaces/IScorer.ts:30](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/interfaces/IScorer.ts#L30)

Factory type for creating scorers.

#### Returns

[`IScorer`](#iscorer)

***

### RecordId

```ts
type RecordId = number;
```

Defined in: [types/core.ts:5](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L5)

Unique identifier for a record within a dataset.

***

### EntityId

```ts
type EntityId = string;
```

Defined in: [types/core.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L8)

Unique identifier for an entity (cluster) across datasets.

***

### RawRecord

```ts
type RawRecord = Record<string, unknown>;
```

Defined in: [types/core.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/types/core.ts#L11)

A raw record — any object with string-indexable fields.

## Variables

### MATCH\_WEIGHT\_INTERPRETATION

```ts
const MATCH_WEIGHT_INTERPRETATION: {
  NEUTRAL: 0;
  WEAK: 2;
  MODERATE: 3;
  STRONG: 4;
  VERY_STRONG: 7;
};
```

Defined in: [fellegi-sunter/match-weight.ts:140](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L140)

Interpreting match weights (for diagnostics):
- M = 0  → 50% probability
- M = 2  → ~80% probability
- M = 3  → ~90% probability
- M = 4  → ~95% probability
- M = 7  → ~99% probability

#### Type Declaration

| Name | Type | Default value | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="property-neutral"></a> `NEUTRAL` | `0` | `0` | [fellegi-sunter/match-weight.ts:141](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L141) |
| <a id="property-weak"></a> `WEAK` | `2` | `2` | [fellegi-sunter/match-weight.ts:142](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L142) |
| <a id="property-moderate"></a> `MODERATE` | `3` | `3` | [fellegi-sunter/match-weight.ts:143](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L143) |
| <a id="property-strong"></a> `STRONG` | `4` | `4` | [fellegi-sunter/match-weight.ts:144](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L144) |
| <a id="property-very_strong"></a> `VERY_STRONG` | `7` | `7` | [fellegi-sunter/match-weight.ts:145](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L145) |

***

### COMPARISON\_LEVELS

```ts
const COMPARISON_LEVELS: {
  EXACT_MATCH: {
     label: "exact_match";
     threshold: 0.99;
  };
  STRONG_MATCH: {
     label: "strong_match";
     threshold: 0.85;
  };
  MODERATE_MATCH: {
     label: "moderate_match";
     threshold: 0.7;
  };
  WEAK_MATCH: {
     label: "weak_match";
     threshold: 0.5;
  };
};
```

Defined in: [matching/comparison.ts:85](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L85)

Common comparison level presets.

#### Type Declaration

| Name | Type | Default value | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="property-exact_match"></a> `EXACT_MATCH` | \{ `label`: `"exact_match"`; `threshold`: `0.99`; \} | - | [matching/comparison.ts:86](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L86) |
| `EXACT_MATCH.label` | `"exact_match"` | `'exact_match'` | [matching/comparison.ts:86](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L86) |
| `EXACT_MATCH.threshold` | `0.99` | `0.99` | [matching/comparison.ts:86](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L86) |
| <a id="property-strong_match"></a> `STRONG_MATCH` | \{ `label`: `"strong_match"`; `threshold`: `0.85`; \} | - | [matching/comparison.ts:87](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L87) |
| `STRONG_MATCH.label` | `"strong_match"` | `'strong_match'` | [matching/comparison.ts:87](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L87) |
| `STRONG_MATCH.threshold` | `0.85` | `0.85` | [matching/comparison.ts:87](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L87) |
| <a id="property-moderate_match"></a> `MODERATE_MATCH` | \{ `label`: `"moderate_match"`; `threshold`: `0.7`; \} | - | [matching/comparison.ts:88](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L88) |
| `MODERATE_MATCH.label` | `"moderate_match"` | `'moderate_match'` | [matching/comparison.ts:88](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L88) |
| `MODERATE_MATCH.threshold` | `0.7` | `0.7` | [matching/comparison.ts:88](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L88) |
| <a id="property-weak_match"></a> `WEAK_MATCH` | \{ `label`: `"weak_match"`; `threshold`: `0.5`; \} | - | [matching/comparison.ts:89](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L89) |
| `WEAK_MATCH.label` | `"weak_match"` | `'weak_match'` | [matching/comparison.ts:89](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L89) |
| `WEAK_MATCH.threshold` | `0.5` | `0.5` | [matching/comparison.ts:89](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L89) |

***

### exactScorer

```ts
const exactScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:57](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L57)

Exact match: 1.0 if equal after trimming, 0.0 otherwise.
Best for: identifiers, emails, phone numbers (after normalization).

***

### levenshteinScorer

```ts
const levenshteinScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:71](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L71)

Normalized Levenshtein similarity [0, 1].
Best for: general text with typos.

***

### damerauLevenshteinScorer

```ts
const damerauLevenshteinScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:85](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L85)

Normalized Damerau-Levenshtein similarity (includes transpositions).
Best for: text with character-swap errors (e.g., "CAKE" vs "ACKE").

***

### jaroScorer

```ts
const jaroScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:97](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L97)

Jaro similarity [0, 1].
Best for: short strings like ID numbers where character order matters less.

***

### jaroWinklerScorer

```ts
const jaroWinklerScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:109](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L109)

Jaro-Winkler similarity — Jaro with prefix bonus.
Best for: personal names (MARTHA vs MARHTA = 0.961).

***

### diceScorer

```ts
const diceScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:121](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L121)

Dice coefficient — bigram overlap [0, 1].
Best for: multi-word text, company names.

***

### jaccardScorer

```ts
const jaccardScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:133](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L133)

Jaccard similarity — n-gram set overlap [0, 1].
Best for: sets, addresses split into tokens.

***

### overlapScorer

```ts
const overlapScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:145](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L145)

Overlap coefficient [0, 1].
Best for: cases where subset/superset relationship matters.

***

### lcsScorer

```ts
const lcsScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:157](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L157)

Longest Common Subsequence similarity [0, 1].
Best for: preserving order in long text comparisons.

***

### soundexScorer

```ts
const soundexScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:169](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L169)

Soundex phonetic match: 1.0 if same Soundex code, 0.0 otherwise.
Best for: English surnames — Robert vs Rupert share R163.

***

### doubleMetaphoneScorer

```ts
const doubleMetaphoneScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:188](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L188)

Double Metaphone fuzzy phonetic match.
Best for: non-English names, complex phonetic variations.

***

### tokenSortScorer

```ts
const tokenSortScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:212](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L212)

Token Sort Ratio: tokenize both strings, sort alphabetically, then
compute Jaro-Winkler on the joined sorted tokens.
Best for: word-order-independent comparisons (names, addresses).

***

### tfidfCosineScorer

```ts
const tfidfCosineScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:230](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L230)

TF-IDF Cosine similarity using character bigrams as tokens.
Best for: product names, short text where bigram patterns matter.

***

### qgramTfIdfScorer

```ts
const qgramTfIdfScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:274](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L274)

Q-gram TF-IDF: tokenize into q-grams and compute Jaccard on the sets.
Best for: pyJedAI-compatible token-based comparisons.

***

### ensembleScorer

```ts
const ensembleScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:300](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L300)

Ensemble scorer: weighted combination of jaro_winkler + levenshtein + token_sort + dice.
Best for: general-purpose name matching (GoldenMatch's recommended ensemble).

***

### numericDiffScorer

```ts
const numericDiffScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:323](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L323)

Numeric difference scorer: 1.0 if equal, linear decay otherwise.
Best for: numeric fields (age, quantity, price).

***

### dateDiffScorer

```ts
const dateDiffScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:341](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L341)

Date difference scorer: similarity based on days between two dates.
Best for: date of birth, event dates.

***

### booleanMatchScorer

```ts
const booleanMatchScorer: IScorer;
```

Defined in: [matching/scorers/js/scorers.ts:365](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L365)

Boolean match: 1.0 if both truthy or both falsy.
Best for: binary flags, yes/no fields.

***

### ALL\_SCORERS

```ts
const ALL_SCORERS: Readonly<Record<string, IScorer>>;
```

Defined in: [matching/scorers/js/scorers.ts:378](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L378)

All 19 scorers in a name-indexed map.

***

### IMPLEMENTED\_SCORER\_COUNT

```ts
const IMPLEMENTED_SCORER_COUNT: 19 = 19;
```

Defined in: [matching/scorers/js/scorers.ts:408](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/js/scorers.ts#L408)

Number of fully implemented scorers (excluding placeholders).

## Functions

### selectUncertainPairs()

```ts
function selectUncertainPairs(pairs, count): number[];
```

Defined in: [active-learning/learner.ts:45](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L45)

Select the most uncertain pairs for labeling.
Uncertainty = 1 - |2 * probability - 1| (maximal at probability = 0.5)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] | All scored candidate pairs |
| `count` | `number` | Number of most uncertain pairs to select |

#### Returns

`number`[]

Indices of the most uncertain pairs (sorted by uncertainty descending)

***

### selectDiverseUncertainPairs()

```ts
function selectDiverseUncertainPairs(pairs, count): number[];
```

Defined in: [active-learning/learner.ts:63](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L63)

Select a diverse batch of uncertain pairs using greedy diversity sampling.
After picking the most uncertain pair, subsequent picks are penalized if
they share records with already-selected pairs (prevents labeling redundant info).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |
| `count` | `number` |

#### Returns

`number`[]

***

### trainLogisticClassifier()

```ts
function trainLogisticClassifier(
   labeled, 
   pairs, 
   options?): LogisticClassifier;
```

Defined in: [active-learning/learner.ts:105](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L105)

Train a logistic regression classifier on labeled pairs.
Uses gradient descent with sigmoid activation.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labeled` | readonly [`LabeledPair`](#labeledpair)[] |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |
| `options?` | \{ `learningRate?`: `number`; `epochs?`: `number`; \} |
| `options.learningRate?` | `number` |
| `options.epochs?` | `number` |

#### Returns

[`LogisticClassifier`](#logisticclassifier)

***

### predictClassifier()

```ts
function predictClassifier(classifier, pair): number;
```

Defined in: [active-learning/learner.ts:176](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L176)

Predict match probability for a pair using a trained classifier.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `classifier` | [`LogisticClassifier`](#logisticclassifier) |
| `pair` | [`ScoredPair`](#scoredpair) |

#### Returns

`number`

***

### createSession()

```ts
function createSession(pairs): ActiveLearningSession;
```

Defined in: [active-learning/learner.ts:189](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L189)

Create a new active learning session.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |

#### Returns

[`ActiveLearningSession`](#activelearningsession)

***

### nextLabelingBatch()

```ts
function nextLabelingBatch(session, batchSize): number[];
```

Defined in: [active-learning/learner.ts:203](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L203)

Select the next batch of pairs to label and update the session.
Returns the indices (into the original pairs array) to label next.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `session` | [`ActiveLearningSession`](#activelearningsession) |
| `batchSize` | `number` |

#### Returns

`number`[]

***

### applyLabels()

```ts
function applyLabels(session, labels): void;
```

Defined in: [active-learning/learner.ts:211](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L211)

Apply labels to the session and retrain the classifier.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `session` | [`ActiveLearningSession`](#activelearningsession) |
| `labels` | readonly [`LabeledPair`](#labeledpair)[] |

#### Returns

`void`

***

### simulateLabeling()

```ts
function simulateLabeling(
   pairs, 
   indices, 
   groundTruth): LabeledPair[];
```

Defined in: [active-learning/learner.ts:231](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L231)

Simulate labeling by using ground truth data.
Returns labeled pairs for the given indices.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |
| `indices` | readonly `number`[] |
| `groundTruth` | `ReadonlyMap`\<`string`, `number`\> |

#### Returns

[`LabeledPair`](#labeledpair)[]

***

### detectLabelContradictions()

```ts
function detectLabelContradictions(labeled): {
  contradictions: string[];
  hasContradiction: boolean;
};
```

Defined in: [active-learning/learner.ts:249](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L249)

Assess labeling quality by detecting contradictory labels.
Contradiction: the same pair labeled differently, or a transitive
contradiction (A≈B labeled 1, B≈C labeled 1, but A≈C labeled 0).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labeled` | readonly [`LabeledPair`](#labeledpair)[] |

#### Returns

```ts
{
  contradictions: string[];
  hasContradiction: boolean;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `contradictions` | `string`[] | [active-learning/learner.ts:250](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L250) |
| `hasContradiction` | `boolean` | [active-learning/learner.ts:251](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/active-learning/learner.ts#L251) |

***

### detectFields()

```ts
function detectFields(records): DetectedField[];
```

Defined in: [auto-config/detector.ts:124](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L124)

Analyze a dataset and detect field semantics.
Uses combined name-pattern + value-distribution matching.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly [`RawRecord`](#rawrecord)[] |

#### Returns

[`DetectedField`](#detectedfield)[]

***

### autoConfigure()

```ts
function autoConfigure(records): AutoConfigResult;
```

Defined in: [auto-config/detector.ts:202](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/auto-config/detector.ts#L202)

Auto-generate a PipelineConfig from detected fields.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly [`RawRecord`](#rawrecord)[] |

#### Returns

[`AutoConfigResult`](#autoconfigresult)

***

### loadFebrl()

```ts
function loadFebrl(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:32](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L32)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadDblpAcm()

```ts
function loadDblpAcm(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:163](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L163)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadAbtBuy()

```ts
function loadAbtBuy(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:254](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L254)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadAmazonGoogle()

```ts
function loadAmazonGoogle(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:258](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L258)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadWdcProducts()

```ts
function loadWdcProducts(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:262](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L262)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadWdcOffers()

```ts
function loadWdcOffers(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:266](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L266)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadItunesAmazon()

```ts
function loadItunesAmazon(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:270](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L270)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadCora()

```ts
function loadCora(): BenchmarkDataset;
```

Defined in: [benchmarks/datasets.ts:274](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L274)

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)

***

### loadAllBenchmarks()

```ts
function loadAllBenchmarks(): BenchmarkDataset[];
```

Defined in: [benchmarks/datasets.ts:279](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/datasets.ts#L279)

Load all 8 benchmark datasets.

#### Returns

[`BenchmarkDataset`](#benchmarkdataset)[]

***

### runBenchmark()

```ts
function runBenchmark(dataset): Promise<BenchmarkResult>;
```

Defined in: [benchmarks/runner.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/runner.ts#L11)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dataset` | [`BenchmarkDataset`](#benchmarkdataset) |

#### Returns

`Promise`\<[`BenchmarkResult`](#benchmarkresult)\>

***

### runAllBenchmarks()

```ts
function runAllBenchmarks(): Promise<{
  results: BenchmarkResult[];
  totalTimeMs: number;
}>;
```

Defined in: [benchmarks/runner.ts:50](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/runner.ts#L50)

#### Returns

`Promise`\<\{
  `results`: [`BenchmarkResult`](#benchmarkresult)[];
  `totalTimeMs`: `number`;
\}\>

***

### formatBenchmarkReport()

```ts
function formatBenchmarkReport(results): string;
```

Defined in: [benchmarks/runner.ts:58](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/benchmarks/runner.ts#L58)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `results` | [`BenchmarkResult`](#benchmarkresult)[] |

#### Returns

`string`

***

### analyzeBlockingRule()

```ts
function analyzeBlockingRule(
   records, 
   pass, 
   options?): BlockingAnalysisResult;
```

Defined in: [blocking/analyzer.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L26)

Analyze a blocking rule without generating all pairs.
Uses sampling to estimate pair count and detect skew.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `pass` | [`BlockingPass`](#blockingpass) |
| `options?` | \{ `sampleSize?`: `number`; \} |
| `options.sampleSize?` | `number` |

#### Returns

[`BlockingAnalysisResult`](#blockinganalysisresult)

***

### recommendBlockingRules()

```ts
function recommendBlockingRules(records, candidatePasses): BlockingPass[];
```

Defined in: [blocking/analyzer.ts:84](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L84)

Analyze all blocking rules in a config and return recommendations.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `candidatePasses` | readonly [`BlockingPass`](#blockingpass)[] |

#### Returns

[`BlockingPass`](#blockingpass)[]

***

### verifyBlockingRecall()

```ts
function verifyBlockingRecall(pairs, trueMatchPairs): number;
```

Defined in: [blocking/analyzer.ts:117](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/analyzer.ts#L117)

Verify that a set of blocking rules captures a target percentage of true matches.
This is a verification function, not optimization.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`CandidatePair`](#candidatepair)[] |
| `trueMatchPairs` | readonly [`CandidatePair`](#candidatepair)[] |

#### Returns

`number`

***

### standardBlocking()

```ts
function standardBlocking(records, config): BlockingResult;
```

Defined in: [blocking/standard.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/standard.ts#L14)

Standard blocking: groups records by blocking key and produces
all pairwise combinations within each group.

Multiple passes are combined via UNION (a pair is included if
it matches ANY pass).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `config` | [`BlockingConfig`](#blockingconfig) |

#### Returns

[`BlockingResult`](#blockingresult)

***

### blockOn()

```ts
function blockOn(...fields): BlockingPass;
```

Defined in: [blocking/standard.ts:89](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/standard.ts#L89)

Convenience function: create a blocking pass config.
Usage: blockOn("first_name", "surname") — Splink-style

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`fields` | readonly `string`[] |

#### Returns

[`BlockingPass`](#blockingpass)

***

### blockOnSoundex()

```ts
function blockOnSoundex(...fields): BlockingPass;
```

Defined in: [blocking/standard.ts:99](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/standard.ts#L99)

Convenience: block with soundex phonetic matching.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`fields` | readonly `string`[] |

#### Returns

[`BlockingPass`](#blockingpass)

***

### tokenBlocking()

```ts
function tokenBlocking(records, config): BlockingResult;
```

Defined in: [blocking/strategies.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/strategies.ts#L14)

Token Blocking: each token in a field value creates a block.
A record can belong to multiple blocks (lazy overlapping blocks).

This is the first stage of pyJedAI's multi-stage pipeline.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `config` | [`BlockingConfig`](#blockingconfig) |

#### Returns

[`BlockingResult`](#blockingresult)

***

### sortedNeighborhood()

```ts
function sortedNeighborhood(records, config): BlockingResult;
```

Defined in: [blocking/strategies.ts:65](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/strategies.ts#L65)

Sorted Neighborhood: sort records by a key, then slide a window
of size `windowSize` over the sorted list, comparing records within
each window.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `config` | [`BlockingConfig`](#blockingconfig) |

#### Returns

[`BlockingResult`](#blockingresult)

***

### multiPassBlocking()

```ts
function multiPassBlocking(records, config): BlockingResult;
```

Defined in: [blocking/strategies.ts:109](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/strategies.ts#L109)

Multi-pass Blocking: multiple independent passes (exact + soundex + substring).
Pairs are the UNION of all passes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `config` | [`BlockingConfig`](#blockingconfig) |

#### Returns

[`BlockingResult`](#blockingresult)

***

### blockPurging()

```ts
function blockPurging(blocks, maxBlockSize?): Map<string, number[]>;
```

Defined in: [blocking/strategies.ts:178](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/strategies.ts#L178)

Block Purging: remove blocks that are too large (oversized).
Oversized blocks contribute many comparisons but few matches.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `blocks` | `Map`\<`string`, `number`[]\> | `undefined` |
| `maxBlockSize` | `number` | `500` |

#### Returns

`Map`\<`string`, `number`[]\>

***

### comparisonNeighborhoodPruning()

```ts
function comparisonNeighborhoodPruning(blocks, minNeighborWeight?): Set<string>;
```

Defined in: [blocking/strategies.ts:198](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/strategies.ts#L198)

Comparison Neighborhood Pruning (CNP): for each entity, keep only
the most promising comparisons based on neighborhood weight.

Simplified implementation: for each block, keep entity pairs
where the weighted overlap meets a threshold.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `blocks` | `Map`\<`string`, `number`[]\> | `undefined` |
| `minNeighborWeight` | `number` | `2` |

#### Returns

`Set`\<`string`\>

***

### metaBlocking()

```ts
function metaBlocking(records, config): BlockingResult;
```

Defined in: [blocking/strategies.ts:228](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/strategies.ts#L228)

Full Meta-blocking pipeline (pyJedAI-style):
  Token Blocking → Block Purging → CNP

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `config` | [`BlockingConfig`](#blockingconfig) |

#### Returns

[`BlockingResult`](#blockingresult)

***

### computeReductionRatio()

```ts
function computeReductionRatio(pairCount, totalRecords): number;
```

Defined in: [blocking/types.ts:59](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L59)

Compute the blocking reduction ratio.
ratio = 1 - (pairs / totalPossiblePairs)
where totalPossiblePairs = n * (n - 1) / 2 for deduplication

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairCount` | `number` |
| `totalRecords` | `number` |

#### Returns

`number`

***

### applyBlockingTransforms()

```ts
function applyBlockingTransforms(value, transforms): string;
```

Defined in: [blocking/types.ts:67](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/blocking/types.ts#L67)

Apply transforms to a field value for blocking key generation.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |
| `transforms` | readonly [`BlockingTransform`](#blockingtransform)[] |

#### Returns

`string`

***

### connectedComponents()

```ts
function connectedComponents(
   pairs, 
   totalRecords, 
   threshold): ClusteringResult;
```

Defined in: [clustering/algorithms.ts:39](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L39)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |
| `totalRecords` | `number` |
| `threshold` | `number` |

#### Returns

[`ClusteringResult`](#clusteringresult)

***

### dbscanClustering()

```ts
function dbscanClustering(
   pairs, 
   totalRecords, 
   eps, 
   minPts): ClusteringResult;
```

Defined in: [clustering/algorithms.ts:57](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L57)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |
| `totalRecords` | `number` |
| `eps` | `number` |
| `minPts` | `number` |

#### Returns

[`ClusteringResult`](#clusteringresult)

***

### uniqueMapping()

```ts
function uniqueMapping(
   pairs, 
   totalRecords, 
   threshold): ClusteringResult;
```

Defined in: [clustering/algorithms.ts:105](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/clustering/algorithms.ts#L105)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |
| `totalRecords` | `number` |
| `threshold` | `number` |

#### Returns

[`ClusteringResult`](#clusteringresult)

***

### evaluateClustering()

```ts
function evaluateClustering(predicted, reference): EvaluationMetrics;
```

Defined in: [evaluation/metrics.ts:49](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/evaluation/metrics.ts#L49)

Evaluate a predicted clustering against a reference (ground truth) clustering.
Only records that appear in BOTH clusterings are considered (inner join).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `predicted` | `ReadonlyMap`\<`string`, [`Cluster`](#cluster)\> |
| `reference` | `ReadonlyMap`\<`string`, [`Cluster`](#cluster)\> |

#### Returns

[`EvaluationMetrics`](#evaluationmetrics)

***

### estimateParameters()

```ts
function estimateParameters(vectors, options?): EMResult;
```

Defined in: [fellegi-sunter/em.ts:40](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/em.ts#L40)

Run the EM algorithm to estimate Fellegi-Sunter parameters
from a set of comparison vectors.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `vectors` | readonly [`ComparisonVector`](#comparisonvector)[] | Comparison vectors from candidate pairs |
| `options` | [`EMOptions`](#emoptions) | EM configuration |

#### Returns

[`EMResult`](#emresult)

Estimated parameters and convergence diagnostics

***

### analyzeFieldCorrelations()

```ts
function analyzeFieldCorrelations(records, fields): CorrelationReport;
```

Defined in: [fellegi-sunter/field-independence.ts:36](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/field-independence.ts#L36)

Analyze field correlations in a dataset.

Detects pairs of fields that are too closely correlated for the
independence assumption of the Fellegi-Sunter model.

Severity thresholds (based on Cramér's V):
  V >= 0.5  → high severity — FS model validity compromised
  V >= 0.3  → medium severity — use with caution
  V >= 0.1  → low severity — minor concern
  V < 0.1   → no warning (fields are sufficiently independent)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `fields` | readonly `string`[] |

#### Returns

[`CorrelationReport`](#correlationreport)

***

### computeMatchWeight()

```ts
function computeMatchWeight(vector, params): MatchWeightResult;
```

Defined in: [fellegi-sunter/match-weight.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L29)

Compute the match weight for a comparison vector using
estimated FS parameters.

Formula: M = log2(lambda/(1-lambda)) + sum(log2(m_i/u_i))
Probability = 2^M / (1 + 2^M)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `vector` | [`ComparisonVector`](#comparisonvector) |
| `params` | [`FSParameters`](#fsparameters) |

#### Returns

[`MatchWeightResult`](#matchweightresult)

***

### computeAggregateMatchWeight()

```ts
function computeAggregateMatchWeight(vectors, params): MatchWeightResult;
```

Defined in: [fellegi-sunter/match-weight.ts:72](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L72)

Compute the aggregate match weight for a full set of comparison vectors.
Assumes field independence — match weights are additive across fields.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `vectors` | readonly [`ComparisonVector`](#comparisonvector)[] |
| `params` | [`FSParameters`](#fsparameters) |

#### Returns

[`MatchWeightResult`](#matchweightresult)

***

### weightToProbability()

```ts
function weightToProbability(weight): number;
```

Defined in: [fellegi-sunter/match-weight.ts:106](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L106)

Convert a match weight to a match probability.
Formula: P = 2^M / (1 + 2^M)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `weight` | `number` |

#### Returns

`number`

***

### probabilityToWeight()

```ts
function probabilityToWeight(probability): number;
```

Defined in: [fellegi-sunter/match-weight.ts:119](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L119)

Convert a match probability to a match weight.
Formula: M = log2(P / (1 - P))

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `probability` | `number` |

#### Returns

`number`

***

### priorWeight()

```ts
function priorWeight(lambda): number;
```

Defined in: [fellegi-sunter/match-weight.ts:128](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/match-weight.ts#L128)

Compute prior weight from lambda.
Formula: M_prior = log2(lambda / (1 - lambda))

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `lambda` | `number` |

#### Returns

`number`

***

### createDefaultParameters()

```ts
function createDefaultParameters(comparisonKeys, options?): FSParameters;
```

Defined in: [fellegi-sunter/parameters.ts:34](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L34)

Default/initial parameters for EM algorithm.
Uses reasonable defaults based on Fellegi-Sunter literature.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `comparisonKeys` | readonly `string`[] |
| `options?` | \{ `initialLambda?`: `number`; `initialM?`: `number`; `initialU?`: `number`; \} |
| `options.initialLambda?` | `number` |
| `options.initialM?` | `number` |
| `options.initialU?` | `number` |

#### Returns

[`FSParameters`](#fsparameters)

***

### extractComparisonKeys()

```ts
function extractComparisonKeys(vectors): string[];
```

Defined in: [fellegi-sunter/parameters.ts:62](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L62)

Extract all unique "field:level" keys from a set of comparison vectors.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `vectors` | readonly [`ComparisonVector`](#comparisonvector)[] |

#### Returns

`string`[]

***

### cloneParametersMutable()

```ts
function cloneParametersMutable(params): {
  lambda: number;
  mProbabilities: Map<string, number>;
  uProbabilities: Map<string, number>;
};
```

Defined in: [fellegi-sunter/parameters.ts:75](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L75)

Clone FSParameters with mutable Maps for EM iteration.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | [`FSParameters`](#fsparameters) |

#### Returns

```ts
{
  lambda: number;
  mProbabilities: Map<string, number>;
  uProbabilities: Map<string, number>;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `lambda` | `number` | [fellegi-sunter/parameters.ts:76](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L76) |
| `mProbabilities` | `Map`\<`string`, `number`\> | [fellegi-sunter/parameters.ts:77](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L77) |
| `uProbabilities` | `Map`\<`string`, `number`\> | [fellegi-sunter/parameters.ts:78](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L78) |

***

### freezeParameters()

```ts
function freezeParameters(params): FSParameters;
```

Defined in: [fellegi-sunter/parameters.ts:90](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L90)

Freeze mutable parameter maps into an immutable FSParameters.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | \{ `lambda`: `number`; `mProbabilities`: `Map`\<`string`, `number`\>; `uProbabilities`: `Map`\<`string`, `number`\>; \} |
| `params.lambda` | `number` |
| `params.mProbabilities` | `Map`\<`string`, `number`\> |
| `params.uProbabilities` | `Map`\<`string`, `number`\> |

#### Returns

[`FSParameters`](#fsparameters)

***

### validateParameters()

```ts
function validateParameters(params): void;
```

Defined in: [fellegi-sunter/parameters.ts:108](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/parameters.ts#L108)

Validate that m/u parameters are physically meaningful.
In a valid FS model: m > u for exact_match levels (match evidence),
and m < u for not_match levels (non-match evidence).
Throws if parameters are invalid.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | [`FSParameters`](#fsparameters) |

#### Returns

`void`

***

### buildTermFrequencies()

```ts
function buildTermFrequencies(records, fields): Map<string, TermFrequency[]>;
```

Defined in: [fellegi-sunter/tf-adjust.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L23)

Build term frequency statistics for a set of records.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `fields` | readonly `string`[] |

#### Returns

`Map`\<`string`, [`TermFrequency`](#termfrequency)[]\>

***

### computeTFAdjustment()

```ts
function computeTFAdjustment(frequency, totalRecords): number;
```

Defined in: [fellegi-sunter/tf-adjust.ts:69](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L69)

Compute the term frequency adjustment factor for a value.

Formula: adjustment = max(0.1, 1 - log10(frequency) / log10(totalRecords))

Rare values (frequency ~ 1) → adjustment ~ 1.0 (no reduction)
Common values (frequency ~ N/10) → adjustment ~ 0.5 (50% reduction)
Extremely common (frequency ~ N) → adjustment = 0.1 (floor)

This follows Splink's approach: common values provide weaker match evidence.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `frequency` | `number` |
| `totalRecords` | `number` |

#### Returns

`number`

***

### adjustWeightByTF()

```ts
function adjustWeightByTF(
   weight, 
   frequency, 
   totalRecords): number;
```

Defined in: [fellegi-sunter/tf-adjust.ts:89](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/fellegi-sunter/tf-adjust.ts#L89)

Adjust a match weight by term frequency.

adjustedWeight = weight * tfAdjustment

This reduces the contribution of high-frequency values to the total match weight.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `weight` | `number` |
| `frequency` | `number` |
| `totalRecords` | `number` |

#### Returns

`number`

***

### scoreWithLLM()

```ts
function scoreWithLLM(
   pairs, 
   records, 
config): Promise<LLMScorerResult[]>;
```

Defined in: [llm/scorer.ts:39](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/llm/scorer.ts#L39)

Score ambiguous boundary pairs using an LLM.

Pairs with scores in [candidateLo, candidateHi] are sent to the LLM
for semantic judgment. Pairs outside this range are returned as-is.

API key: Set DEEPSEEK_API_KEY environment variable.
NEVER hardcode API keys in source code.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairs` | readonly [`ScoredPair`](#scoredpair)[] |
| `records` | readonly `Record`\<`string`, `unknown`\>[] |
| `config` | [`LLMScorerConfig`](#llmscorerconfig) |

#### Returns

`Promise`\<[`LLMScorerResult`](#llmscorerresult)[]\>

***

### generateComparisonVectors()

```ts
function generateComparisonVectors(
   recordA, 
   recordB, 
   specs, 
   fieldMetadata): ComparisonVector[];
```

Defined in: [matching/comparison.ts:45](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L45)

Generate comparison vectors for a pair of records given comparison specs.
For each spec, compares the two records' field values and assigns
the first matching level.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `recordA` | `Record`\<`string`, `unknown`\> |
| `recordB` | `Record`\<`string`, `unknown`\> |
| `specs` | readonly [`ComparisonSpec`](#comparisonspec)[] |
| `fieldMetadata` | `Map`\<`string`, [`FieldMetadata`](#fieldmetadata)\> |

#### Returns

[`ComparisonVector`](#comparisonvector)[]

***

### nameComparisonSpec()

```ts
function nameComparisonSpec(field): ComparisonSpec;
```

Defined in: [matching/comparison.ts:93](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L93)

Generate a standard Splink-style ComparisonSpec for a name field.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `string` |

#### Returns

[`ComparisonSpec`](#comparisonspec)

***

### emailComparisonSpec()

```ts
function emailComparisonSpec(field): ComparisonSpec;
```

Defined in: [matching/comparison.ts:107](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L107)

Generate a standard Splink-style ComparisonSpec for an email field.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `string` |

#### Returns

[`ComparisonSpec`](#comparisonspec)

***

### dateComparisonSpec()

```ts
function dateComparisonSpec(field): ComparisonSpec;
```

Defined in: [matching/comparison.ts:116](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/comparison.ts#L116)

Generate a standard Splink-style ComparisonSpec for a date field.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `string` |

#### Returns

[`ComparisonSpec`](#comparisonspec)

***

### getScorers()

```ts
function getScorers(): Readonly<Record<string, IScorer>>;
```

Defined in: [matching/scorers/registry.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/registry.ts#L14)

Get all available scorers, preferring WASM-accelerated versions when available.
Pure JS scorers are always the fallback.

#### Returns

`Readonly`\<`Record`\<`string`, [`IScorer`](#iscorer)\>\>

***

### getScorer()

```ts
function getScorer(name): IScorer;
```

Defined in: [matching/scorers/registry.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/registry.ts#L29)

Get a single scorer by name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

[`IScorer`](#iscorer)

#### Throws

If the scorer name is not registered.

***

### scorerCount()

```ts
function scorerCount(): number;
```

Defined in: [matching/scorers/registry.ts:39](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/registry.ts#L39)

Number of scorers currently loaded.

#### Returns

`number`

***

### resetScorerCache()

```ts
function resetScorerCache(): void;
```

Defined in: [matching/scorers/registry.ts:44](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/registry.ts#L44)

Reset the scorer cache (for testing).

#### Returns

`void`

***

### validateScorerRegistry()

```ts
function validateScorerRegistry(): {
  valid: boolean;
  errors: string[];
};
```

Defined in: [matching/scorers/registry.ts:49](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/registry.ts#L49)

Validate that all 19 scorers are loaded and functional.

#### Returns

```ts
{
  valid: boolean;
  errors: string[];
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `valid` | `boolean` | [matching/scorers/registry.ts:49](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/registry.ts#L49) |
| `errors` | `string`[] | [matching/scorers/registry.ts:49](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/registry.ts#L49) |

***

### tryLoadWasmScorers()

```ts
function tryLoadWasmScorers(): Promise<Readonly<Record<string, IScorer>> | null>;
```

Defined in: [matching/scorers/wasm/loader.ts:14](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/matching/scorers/wasm/loader.ts#L14)

Attempt to load WASM-accelerated scorers.
Returns null if WASM is unavailable.

#### Returns

`Promise`\<`Readonly`\<`Record`\<`string`, [`IScorer`](#iscorer)\>\> \| `null`\>

***

### incrementalAdd()

```ts
function incrementalAdd(
   newRecords, 
   existingResult, 
   existingPairs, 
   matchFn, 
threshold): Promise<ClusteringResult>;
```

Defined in: [pipeline/incremental.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/incremental.ts#L17)

Incrementally add new records to an existing clustering.
Only new records are compared against existing clusters.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `newRecords` | [`RawRecord`](#rawrecord)[] |
| `existingResult` | [`ClusteringResult`](#clusteringresult) |
| `existingPairs` | [`ScoredPair`](#scoredpair)[] |
| `matchFn` | (`a`, `b`) => `Promise`\<[`ScoredPair`](#scoredpair)\> |
| `threshold` | `number` |

#### Returns

`Promise`\<[`ClusteringResult`](#clusteringresult)\>

Updated clustering result.

***

### incrementalDelete()

```ts
function incrementalDelete(
   deletedIds, 
   existingResult, 
   existingPairs, 
   threshold): ClusteringResult;
```

Defined in: [pipeline/incremental.ts:51](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/incremental.ts#L51)

Incrementally delete records from an existing clustering.
Removes deleted records and re-clusters affected entities.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `deletedIds` | readonly `number`[] |
| `existingResult` | [`ClusteringResult`](#clusteringresult) |
| `existingPairs` | [`ScoredPair`](#scoredpair)[] |
| `threshold` | `number` |

#### Returns

[`ClusteringResult`](#clusteringresult)

***

### incrementalModify()

```ts
function incrementalModify(
   modifiedIds, 
   totalRecords, 
   existingPairs, 
   threshold): ClusteringResult;
```

Defined in: [pipeline/incremental.ts:86](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/incremental.ts#L86)

Incrementally modify records in an existing clustering.
Modified records are re-compared against all other records.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `modifiedIds` | readonly `number`[] |
| `totalRecords` | `number` |
| `existingPairs` | [`ScoredPair`](#scoredpair)[] |
| `threshold` | `number` |

#### Returns

[`ClusteringResult`](#clusteringresult)

***

### runPipeline()

```ts
function runPipeline(
   records, 
   config, 
   options?, 
_groundTruth?): Promise<PipelineResult>;
```

Defined in: [pipeline/runner.ts:56](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pipeline/runner.ts#L56)

Run the full entity resolution pipeline on a set of records.

Pipeline stages:
1. Preprocessing — Unicode repair, normalization
2. Blocking — Generate candidate pairs
3. Matching — Generate comparison vectors + FS match weights
4. Clustering — Group pairs into entity clusters
5. Evaluation — Compute 12 metrics (if ground truth provided)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | [`RawRecord`](#rawrecord)[] |
| `config` | [`PipelineConfig`](#pipelineconfig) |
| `options?` | [`PipelineOptions`](#pipelineoptions) |
| `_groundTruth?` | `Map`\<`string`, `number`[]\> |

#### Returns

`Promise`\<[`PipelineResult`](#pipelineresult)\>

***

### encodePPRL()

```ts
function encodePPRL(value, config): BloomFilter;
```

Defined in: [pprl/bloom.ts:89](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L89)

Encode a field value into a Bloom filter for PPRL.

Tokenizes the value into q-grams, then adds each q-gram
to the Bloom filter using salted hashing.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |
| `config` | [`PPRLConfig`](#pprlconfig) |

#### Returns

[`BloomFilter`](#bloomfilter)

***

### matchPPRL()

```ts
function matchPPRL(
   recordA, 
   recordB, 
config): Record<string, number>;
```

Defined in: [pprl/bloom.ts:114](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/pprl/bloom.ts#L114)

Compare two records using PPRL-encoded Bloom filters.

Each field value is encoded into a Bloom filter, then
compared using Dice coefficient on the bit vectors.

Returns similarity in [0, 1].

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `recordA` | `Record`\<`string`, `string`\> |
| `recordB` | `Record`\<`string`, `string`\> |
| `config` | [`PPRLConfig`](#pprlconfig) |

#### Returns

`Record`\<`string`, `number`\>

***

### repairUnicode()

```ts
function repairUnicode(input): string;
```

Defined in: [preprocessing/cleaner.ts:61](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/preprocessing/cleaner.ts#L61)

Repair common Unicode issues in a string (ftfy-equivalent).
- Replaces smart quotes, dashes, and other confusables
- Fixes common mojibake (UTF-8 mis-decoded as Latin-1)
- Removes control characters
- Strips leading/trailing whitespace

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` |

#### Returns

`string`

The repaired string.

***

### normalize()

```ts
function normalize(value): string;
```

Defined in: [preprocessing/cleaner.ts:89](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/preprocessing/cleaner.ts#L89)

Normalize a string value for comparison:
- Repair Unicode
- Convert to lowercase
- Collapse whitespace

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`string`

***

### normalizeEmail()

```ts
function normalizeEmail(value): string;
```

Defined in: [preprocessing/cleaner.ts:101](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/preprocessing/cleaner.ts#L101)

Normalize an email address:
- Lowercase
- Strip whitespace
- Remove trailing dots in local part (Gmail-specific)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`string`

***

### normalizePhone()

```ts
function normalizePhone(value): string;
```

Defined in: [preprocessing/cleaner.ts:116](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/preprocessing/cleaner.ts#L116)

Normalize a phone number:
- Strip all non-digit characters

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`string`

***

### preprocessRecords()

```ts
function preprocessRecords(records, options?): void;
```

Defined in: [preprocessing/cleaner.ts:124](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-core/src/preprocessing/cleaner.ts#L124)

Apply preprocessing to a batch of records.
Each record's string fields are repaired and normalized in-place.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `records` | `Record`\<`string`, `unknown`\>[] | - |
| `options?` | \{ `emailFields?`: readonly `string`[]; `phoneFields?`: readonly `string`[]; \} | - |
| `options.emailFields?` | readonly `string`[] | Fields to treat as email addresses. |
| `options.phoneFields?` | readonly `string`[] | Fields to treat as phone numbers. |

#### Returns

`void`
