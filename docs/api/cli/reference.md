## Functions

### renderWaterfallTUI()

```ts
function renderWaterfallTUI(data, maxWidth?): string;
```

Defined in: [renderers.ts:59](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-cli/src/tui/renderers.ts#L59)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `WaterfallChartData` | `undefined` |
| `maxWidth` | `number` | `60` |

#### Returns

`string`

***

### renderHistogramTUI()

```ts
function renderHistogramTUI(data, maxWidth?): string;
```

Defined in: [renderers.ts:84](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-cli/src/tui/renderers.ts#L84)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `HistogramData` | `undefined` |
| `maxWidth` | `number` | `60` |

#### Returns

`string`

***

### renderMuTableTUI()

```ts
function renderMuTableTUI(data, maxWidth?): string;
```

Defined in: [renderers.ts:114](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-cli/src/tui/renderers.ts#L114)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `MuChartData` | `undefined` |
| `maxWidth` | `number` | `72` |

#### Returns

`string`

***

### renderClusterTreeTUI()

```ts
function renderClusterTreeTUI(data, maxWidth?): string;
```

Defined in: [renderers.ts:143](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-cli/src/tui/renderers.ts#L143)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `ClusterExplorerData` | `undefined` |
| `maxWidth` | `number` | `60` |

#### Returns

`string`

***

### renderThresholdTUI()

```ts
function renderThresholdTUI(
   threshold, 
   totalPairs, 
   aboveThreshold, 
   maxWidth?): string;
```

Defined in: [renderers.ts:170](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-cli/src/tui/renderers.ts#L170)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `threshold` | `number` | `undefined` |
| `totalPairs` | `number` | `undefined` |
| `aboveThreshold` | `number` | `undefined` |
| `maxWidth` | `number` | `50` |

#### Returns

`string`

***

### renderNavHint()

```ts
function renderNavHint(): string;
```

Defined in: [renderers.ts:209](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-cli/src/tui/renderers.ts#L209)

#### Returns

`string`
