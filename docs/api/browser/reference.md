## Classes

### DuckDBWasmStore

Defined in: [duckdb-wasm-store.ts:67](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L67)

#### Constructors

##### Constructor

```ts
new DuckDBWasmStore(options?): DuckDBWasmStore;
```

Defined in: [duckdb-wasm-store.ts:80](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L80)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | `DuckDBWasmOptions` |

###### Returns

[`DuckDBWasmStore`](#duckdbwasmstore)

#### Methods

##### getInitResult()

```ts
getInitResult(): DuckDBWasmInitResult;
```

Defined in: [duckdb-wasm-store.ts:86](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L86)

Get initialization result for health monitoring.

###### Returns

`DuckDBWasmInitResult`

##### init()

```ts
init(): Promise<DuckDBWasmInitResult>;
```

Defined in: [duckdb-wasm-store.ts:101](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L101)

Initialize DuckDB WASM with enterprise distribution model.

Resolution order:
1. opts.offline → skip WASM, use memory
2. opts.wasmUrl → custom URL (enterprise self-hosting)
3. Bundled WASM in npm package → default
4. opts.wasmFallbackUrls → try each in order
5. GitHub Releases assets → last-resort CDN
6. MemoryEntityStore → graceful degradation (never crashes)

###### Returns

`Promise`\<`DuckDBWasmInitResult`\>

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

Defined in: [duckdb-wasm-store.ts:238](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L238)

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

Defined in: [duckdb-wasm-store.ts:249](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L249)

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
upsertEntity(e): Promise<void>;
```

Defined in: [duckdb-wasm-store.ts:254](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L254)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | \{ `clusterId`: `string`; `memberIds`: `number`[]; `cohesion`: `number`; \} |
| `e.clusterId` | `string` |
| `e.memberIds` | `number`[] |
| `e.cohesion` | `number` |

###### Returns

`Promise`\<`void`\>

##### deleteEntity()

```ts
deleteEntity(id): Promise<void>;
```

Defined in: [duckdb-wasm-store.ts:259](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L259)

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

Defined in: [duckdb-wasm-store.ts:264](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L264)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `from` | `string` |
| `into` | `string` |

###### Returns

`Promise`\<`void`\>

##### applySplit()

```ts
applySplit(id, groups): Promise<void>;
```

Defined in: [duckdb-wasm-store.ts:269](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L269)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `groups` | `string`[][] |

###### Returns

`Promise`\<`void`\>

##### close()

```ts
close(): Promise<void>;
```

Defined in: [duckdb-wasm-store.ts:273](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-browser/src/storage/duckdb-wasm-store.ts#L273)

###### Returns

`Promise`\<`void`\>
