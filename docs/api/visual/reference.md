## Classes

### `abstract` ErBaseElement

Defined in: [components/web/elements.ts:48](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L48)

Base class for entity-resolution web components.
Provides common Shadow DOM setup and attribute observation.

#### Extends

- `HTMLElement`

#### Extended by

- [`ErWaterfallElement`](#erwaterfallelement)
- [`ErHistogramElement`](#erhistogramelement)
- [`ErClusterExplorerElement`](#erclusterexplorerelement)
- [`ErMuChartElement`](#ermuchartelement)

#### Constructors

##### Constructor

```ts
new ErBaseElement(): ErBaseElement;
```

Defined in: [components/web/elements.ts:51](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L51)

###### Returns

[`ErBaseElement`](#abstract-erbaseelement)

###### Overrides

```ts
HTMLElement.constructor
```

#### Properties

##### root

```ts
protected root: ShadowRoot;
```

Defined in: [components/web/elements.ts:49](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L49)

#### Methods

##### applyTheme()

```ts
protected applyTheme(): void;
```

Defined in: [components/web/elements.ts:57](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L57)

Apply theme CSS custom properties to the shadow root.

###### Returns

`void`

##### parseDataAttr()

```ts
protected parseDataAttr<T>(attr): T | null;
```

Defined in: [components/web/elements.ts:64](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L64)

Parse a JSON attribute value safely.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `attr` | `string` \| `null` |

###### Returns

`T` \| `null`

***

### ErWaterfallElement

Defined in: [components/web/elements.ts:78](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L78)

Base class for entity-resolution web components.
Provides common Shadow DOM setup and attribute observation.

#### Extends

- [`ErBaseElement`](#abstract-erbaseelement)

#### Constructors

##### Constructor

```ts
new ErWaterfallElement(): ErWaterfallElement;
```

Defined in: [components/web/elements.ts:51](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L51)

###### Returns

[`ErWaterfallElement`](#erwaterfallelement)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`constructor`](#constructor)

#### Properties

##### root

```ts
protected root: ShadowRoot;
```

Defined in: [components/web/elements.ts:49](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L49)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`root`](#root)

##### observedAttributes

```ts
readonly static observedAttributes: string[];
```

Defined in: [components/web/elements.ts:79](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L79)

#### Methods

##### applyTheme()

```ts
protected applyTheme(): void;
```

Defined in: [components/web/elements.ts:57](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L57)

Apply theme CSS custom properties to the shadow root.

###### Returns

`void`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`applyTheme`](#applytheme)

##### parseDataAttr()

```ts
protected parseDataAttr<T>(attr): T | null;
```

Defined in: [components/web/elements.ts:64](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L64)

Parse a JSON attribute value safely.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `attr` | `string` \| `null` |

###### Returns

`T` \| `null`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`parseDataAttr`](#parsedataattr)

##### connectedCallback()

```ts
connectedCallback(): void;
```

Defined in: [components/web/elements.ts:83](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L83)

###### Returns

`void`

##### attributeChangedCallback()

```ts
attributeChangedCallback(
   name, 
   _oldValue, 
   newValue): void;
```

Defined in: [components/web/elements.ts:88](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L88)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `_oldValue` | `string` \| `null` |
| `newValue` | `string` \| `null` |

###### Returns

`void`

***

### ErHistogramElement

Defined in: [components/web/elements.ts:133](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L133)

Base class for entity-resolution web components.
Provides common Shadow DOM setup and attribute observation.

#### Extends

- [`ErBaseElement`](#abstract-erbaseelement)

#### Constructors

##### Constructor

```ts
new ErHistogramElement(): ErHistogramElement;
```

Defined in: [components/web/elements.ts:51](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L51)

###### Returns

[`ErHistogramElement`](#erhistogramelement)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`constructor`](#constructor)

#### Properties

##### root

```ts
protected root: ShadowRoot;
```

Defined in: [components/web/elements.ts:49](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L49)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`root`](#root)

##### observedAttributes

```ts
readonly static observedAttributes: string[];
```

Defined in: [components/web/elements.ts:134](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L134)

#### Methods

##### applyTheme()

```ts
protected applyTheme(): void;
```

Defined in: [components/web/elements.ts:57](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L57)

Apply theme CSS custom properties to the shadow root.

###### Returns

`void`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`applyTheme`](#applytheme)

##### parseDataAttr()

```ts
protected parseDataAttr<T>(attr): T | null;
```

Defined in: [components/web/elements.ts:64](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L64)

Parse a JSON attribute value safely.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `attr` | `string` \| `null` |

###### Returns

`T` \| `null`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`parseDataAttr`](#parsedataattr)

##### connectedCallback()

```ts
connectedCallback(): void;
```

Defined in: [components/web/elements.ts:138](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L138)

###### Returns

`void`

##### attributeChangedCallback()

```ts
attributeChangedCallback(
   name, 
   _oldValue, 
   newValue): void;
```

Defined in: [components/web/elements.ts:143](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L143)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `_oldValue` | `string` \| `null` |
| `newValue` | `string` \| `null` |

###### Returns

`void`

***

### ErClusterExplorerElement

Defined in: [components/web/elements.ts:187](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L187)

Base class for entity-resolution web components.
Provides common Shadow DOM setup and attribute observation.

#### Extends

- [`ErBaseElement`](#abstract-erbaseelement)

#### Constructors

##### Constructor

```ts
new ErClusterExplorerElement(): ErClusterExplorerElement;
```

Defined in: [components/web/elements.ts:51](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L51)

###### Returns

[`ErClusterExplorerElement`](#erclusterexplorerelement)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`constructor`](#constructor)

#### Properties

##### root

```ts
protected root: ShadowRoot;
```

Defined in: [components/web/elements.ts:49](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L49)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`root`](#root)

##### observedAttributes

```ts
readonly static observedAttributes: string[];
```

Defined in: [components/web/elements.ts:188](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L188)

#### Methods

##### applyTheme()

```ts
protected applyTheme(): void;
```

Defined in: [components/web/elements.ts:57](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L57)

Apply theme CSS custom properties to the shadow root.

###### Returns

`void`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`applyTheme`](#applytheme)

##### parseDataAttr()

```ts
protected parseDataAttr<T>(attr): T | null;
```

Defined in: [components/web/elements.ts:64](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L64)

Parse a JSON attribute value safely.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `attr` | `string` \| `null` |

###### Returns

`T` \| `null`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`parseDataAttr`](#parsedataattr)

##### connectedCallback()

```ts
connectedCallback(): void;
```

Defined in: [components/web/elements.ts:192](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L192)

###### Returns

`void`

##### attributeChangedCallback()

```ts
attributeChangedCallback(
   name, 
   _oldValue, 
   newValue): void;
```

Defined in: [components/web/elements.ts:197](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L197)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `_oldValue` | `string` \| `null` |
| `newValue` | `string` \| `null` |

###### Returns

`void`

***

### ErMuChartElement

Defined in: [components/web/elements.ts:231](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L231)

Base class for entity-resolution web components.
Provides common Shadow DOM setup and attribute observation.

#### Extends

- [`ErBaseElement`](#abstract-erbaseelement)

#### Constructors

##### Constructor

```ts
new ErMuChartElement(): ErMuChartElement;
```

Defined in: [components/web/elements.ts:51](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L51)

###### Returns

[`ErMuChartElement`](#ermuchartelement)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`constructor`](#constructor)

#### Properties

##### root

```ts
protected root: ShadowRoot;
```

Defined in: [components/web/elements.ts:49](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L49)

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`root`](#root)

##### observedAttributes

```ts
readonly static observedAttributes: string[];
```

Defined in: [components/web/elements.ts:232](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L232)

#### Methods

##### applyTheme()

```ts
protected applyTheme(): void;
```

Defined in: [components/web/elements.ts:57](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L57)

Apply theme CSS custom properties to the shadow root.

###### Returns

`void`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`applyTheme`](#applytheme)

##### parseDataAttr()

```ts
protected parseDataAttr<T>(attr): T | null;
```

Defined in: [components/web/elements.ts:64](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L64)

Parse a JSON attribute value safely.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `attr` | `string` \| `null` |

###### Returns

`T` \| `null`

###### Inherited from

[`ErBaseElement`](#abstract-erbaseelement).[`parseDataAttr`](#parsedataattr)

##### connectedCallback()

```ts
connectedCallback(): void;
```

Defined in: [components/web/elements.ts:236](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L236)

###### Returns

`void`

##### attributeChangedCallback()

```ts
attributeChangedCallback(
   name, 
   _oldValue, 
   newValue): void;
```

Defined in: [components/web/elements.ts:241](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L241)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `_oldValue` | `string` \| `null` |
| `newValue` | `string` \| `null` |

###### Returns

`void`

## Interfaces

### WaterfallBar

Defined in: [data/api.ts:12](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L12)

A single bar in the waterfall chart.

#### Properties

##### label

```ts
readonly label: string;
```

Defined in: [data/api.ts:13](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L13)

##### weight

```ts
readonly weight: number;
```

Defined in: [data/api.ts:14](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L14)

##### cumulative

```ts
readonly cumulative: number;
```

Defined in: [data/api.ts:15](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L15)

##### valueA

```ts
readonly valueA: string;
```

Defined in: [data/api.ts:16](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L16)

##### valueB

```ts
readonly valueB: string;
```

Defined in: [data/api.ts:17](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L17)

##### comparisonLevel

```ts
readonly comparisonLevel: string;
```

Defined in: [data/api.ts:18](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L18)

***

### WaterfallChartData

Defined in: [data/api.ts:22](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L22)

Complete waterfall chart data for a record pair.

#### Properties

##### recordPair

```ts
readonly recordPair: {
  idA: number;
  idB: number;
};
```

Defined in: [data/api.ts:23](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L23)

###### idA

```ts
readonly idA: number;
```

###### idB

```ts
readonly idB: number;
```

##### priorWeight

```ts
readonly priorWeight: number;
```

Defined in: [data/api.ts:24](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L24)

##### bars

```ts
readonly bars: readonly WaterfallBar[];
```

Defined in: [data/api.ts:25](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L25)

##### totalWeight

```ts
readonly totalWeight: number;
```

Defined in: [data/api.ts:26](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L26)

##### matchProbability

```ts
readonly matchProbability: number;
```

Defined in: [data/api.ts:27](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L27)

***

### HistogramBin

Defined in: [data/api.ts:82](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L82)

A histogram bin for match weight distribution.

#### Properties

##### minWeight

```ts
readonly minWeight: number;
```

Defined in: [data/api.ts:83](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L83)

##### maxWeight

```ts
readonly maxWeight: number;
```

Defined in: [data/api.ts:84](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L84)

##### count

```ts
readonly count: number;
```

Defined in: [data/api.ts:85](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L85)

***

### HistogramData

Defined in: [data/api.ts:89](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L89)

Complete histogram data.

#### Properties

##### bins

```ts
readonly bins: readonly HistogramBin[];
```

Defined in: [data/api.ts:90](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L90)

##### threshold?

```ts
readonly optional threshold?: number;
```

Defined in: [data/api.ts:91](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L91)

##### summary

```ts
readonly summary: {
  totalPairs: number;
  aboveThreshold: number;
  belowThreshold: number;
};
```

Defined in: [data/api.ts:92](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L92)

###### totalPairs

```ts
readonly totalPairs: number;
```

###### aboveThreshold

```ts
readonly aboveThreshold: number;
```

###### belowThreshold

```ts
readonly belowThreshold: number;
```

***

### MuFieldData

Defined in: [data/api.ts:163](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L163)

A single field's m/u parameters.

#### Properties

##### field

```ts
readonly field: string;
```

Defined in: [data/api.ts:164](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L164)

##### levels

```ts
readonly levels: readonly MuLevelData[];
```

Defined in: [data/api.ts:165](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L165)

***

### MuLevelData

Defined in: [data/api.ts:169](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L169)

Parameters for one comparison level.

#### Properties

##### label

```ts
readonly label: string;
```

Defined in: [data/api.ts:170](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L170)

##### mProbability

```ts
readonly mProbability: number;
```

Defined in: [data/api.ts:171](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L171)

##### uProbability

```ts
readonly uProbability: number;
```

Defined in: [data/api.ts:172](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L172)

##### weight

```ts
readonly weight: number;
```

Defined in: [data/api.ts:173](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L173)

***

### MuChartData

Defined in: [data/api.ts:177](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L177)

Complete m/u chart data.

#### Properties

##### fields

```ts
readonly fields: readonly MuFieldData[];
```

Defined in: [data/api.ts:178](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L178)

##### lambda

```ts
readonly lambda: number;
```

Defined in: [data/api.ts:179](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L179)

***

### ClusterTreeNode

Defined in: [data/api.ts:212](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L212)

Tree node for cluster exploration.

#### Properties

##### id

```ts
readonly id: string;
```

Defined in: [data/api.ts:213](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L213)

##### label

```ts
readonly label: string;
```

Defined in: [data/api.ts:214](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L214)

##### size

```ts
readonly size: number;
```

Defined in: [data/api.ts:215](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L215)

##### cohesion

```ts
readonly cohesion: number;
```

Defined in: [data/api.ts:216](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L216)

##### children

```ts
readonly children: readonly ClusterTreeNode[];
```

Defined in: [data/api.ts:217](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L217)

***

### ClusterExplorerData

Defined in: [data/api.ts:221](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L221)

Complete cluster explorer data.

#### Properties

##### tree

```ts
readonly tree: ClusterTreeNode;
```

Defined in: [data/api.ts:222](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L222)

##### totalClusters

```ts
readonly totalClusters: number;
```

Defined in: [data/api.ts:223](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L223)

##### totalRecords

```ts
readonly totalRecords: number;
```

Defined in: [data/api.ts:224](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L224)

##### singletonCount

```ts
readonly singletonCount: number;
```

Defined in: [data/api.ts:225](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L225)

***

### RecordSummary

Defined in: [data/api.ts:229](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L229)

A summary of a single record for display in cluster view.

#### Properties

##### id

```ts
readonly id: number;
```

Defined in: [data/api.ts:230](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L230)

##### fields

```ts
readonly fields: Readonly<Record<string, unknown>>;
```

Defined in: [data/api.ts:231](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L231)

***

### EvaluationAxis

Defined in: [data/api.ts:278](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L278)

Single axis in the evaluation radar chart.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [data/api.ts:279](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L279)

##### value

```ts
readonly value: number;
```

Defined in: [data/api.ts:280](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L280)

##### maxValue

```ts
readonly maxValue: number;
```

Defined in: [data/api.ts:281](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L281)

***

### EvaluationRadarData

Defined in: [data/api.ts:285](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L285)

Complete evaluation visualization data.

#### Properties

##### axes

```ts
readonly axes: readonly EvaluationAxis[];
```

Defined in: [data/api.ts:286](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L286)

***

### UnlinkablesData

Defined in: [data/api.ts:329](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L329)

Unlinkable record analysis data.

#### Properties

##### totalRecords

```ts
readonly totalRecords: number;
```

Defined in: [data/api.ts:330](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L330)

##### linkedRecords

```ts
readonly linkedRecords: number;
```

Defined in: [data/api.ts:331](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L331)

##### unlinkedRecords

```ts
readonly unlinkedRecords: number;
```

Defined in: [data/api.ts:332](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L332)

##### matchRate

```ts
readonly matchRate: number;
```

Defined in: [data/api.ts:333](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L333)

***

### WaterfallState

Defined in: [headless/state-machines.ts:16](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L16)

#### Properties

##### data

```ts
readonly data: WaterfallChartData | null;
```

Defined in: [headless/state-machines.ts:17](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L17)

##### hoveredBar

```ts
readonly hoveredBar: number | null;
```

Defined in: [headless/state-machines.ts:18](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L18)

##### selectedPair

```ts
readonly selectedPair: number;
```

Defined in: [headless/state-machines.ts:19](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L19)

***

### WaterfallActions

Defined in: [headless/state-machines.ts:22](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L22)

#### Methods

##### hover()

```ts
hover(barIndex): void;
```

Defined in: [headless/state-machines.ts:23](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L23)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `barIndex` | `number` |

###### Returns

`void`

##### unhover()

```ts
unhover(): void;
```

Defined in: [headless/state-machines.ts:24](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L24)

###### Returns

`void`

##### selectPair()

```ts
selectPair(pairIndex): void;
```

Defined in: [headless/state-machines.ts:25](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L25)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `pairIndex` | `number` |

###### Returns

`void`

##### loadData()

```ts
loadData(data): void;
```

Defined in: [headless/state-machines.ts:26](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L26)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`WaterfallChartData`](#waterfallchartdata) |

###### Returns

`void`

***

### HistogramState

Defined in: [headless/state-machines.ts:58](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L58)

#### Properties

##### data

```ts
readonly data: HistogramData | null;
```

Defined in: [headless/state-machines.ts:59](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L59)

##### hoveredBin

```ts
readonly hoveredBin: number | null;
```

Defined in: [headless/state-machines.ts:60](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L60)

##### threshold

```ts
readonly threshold: number;
```

Defined in: [headless/state-machines.ts:61](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L61)

***

### HistogramActions

Defined in: [headless/state-machines.ts:64](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L64)

#### Methods

##### hover()

```ts
hover(binIndex): void;
```

Defined in: [headless/state-machines.ts:65](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L65)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `binIndex` | `number` |

###### Returns

`void`

##### unhover()

```ts
unhover(): void;
```

Defined in: [headless/state-machines.ts:66](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L66)

###### Returns

`void`

##### setThreshold()

```ts
setThreshold(t): void;
```

Defined in: [headless/state-machines.ts:67](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L67)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `number` |

###### Returns

`void`

##### loadData()

```ts
loadData(data): void;
```

Defined in: [headless/state-machines.ts:68](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L68)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`HistogramData`](#histogramdata) |

###### Returns

`void`

***

### ClusterExplorerState

Defined in: [headless/state-machines.ts:101](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L101)

#### Properties

##### data

```ts
readonly data: ClusterExplorerData | null;
```

Defined in: [headless/state-machines.ts:102](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L102)

##### expandedNodes

```ts
readonly expandedNodes: ReadonlySet<string>;
```

Defined in: [headless/state-machines.ts:103](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L103)

##### selectedNode

```ts
readonly selectedNode: string | null;
```

Defined in: [headless/state-machines.ts:104](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L104)

***

### ClusterExplorerActions

Defined in: [headless/state-machines.ts:107](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L107)

#### Methods

##### toggleNode()

```ts
toggleNode(nodeId): void;
```

Defined in: [headless/state-machines.ts:108](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L108)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeId` | `string` |

###### Returns

`void`

##### selectNode()

```ts
selectNode(nodeId): void;
```

Defined in: [headless/state-machines.ts:109](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L109)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeId` | `string` |

###### Returns

`void`

##### loadData()

```ts
loadData(data): void;
```

Defined in: [headless/state-machines.ts:110](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L110)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`ClusterExplorerData`](#clusterexplorerdata) |

###### Returns

`void`

##### expandAll()

```ts
expandAll(): void;
```

Defined in: [headless/state-machines.ts:111](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L111)

###### Returns

`void`

##### collapseAll()

```ts
collapseAll(): void;
```

Defined in: [headless/state-machines.ts:112](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L112)

###### Returns

`void`

***

### MuChartState

Defined in: [headless/state-machines.ts:168](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L168)

#### Properties

##### data

```ts
readonly data: MuChartData | null;
```

Defined in: [headless/state-machines.ts:169](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L169)

##### selectedField

```ts
readonly selectedField: number | null;
```

Defined in: [headless/state-machines.ts:170](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L170)

##### viewMode

```ts
readonly viewMode: "grouped" | "stacked";
```

Defined in: [headless/state-machines.ts:171](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L171)

***

### MuChartActions

Defined in: [headless/state-machines.ts:174](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L174)

#### Methods

##### selectField()

```ts
selectField(fieldIndex): void;
```

Defined in: [headless/state-machines.ts:175](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L175)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fieldIndex` | `number` |

###### Returns

`void`

##### setViewMode()

```ts
setViewMode(mode): void;
```

Defined in: [headless/state-machines.ts:176](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L176)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | `"grouped"` \| `"stacked"` |

###### Returns

`void`

##### loadData()

```ts
loadData(data): void;
```

Defined in: [headless/state-machines.ts:177](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L177)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`MuChartData`](#muchartdata) |

###### Returns

`void`

## Variables

### DEFAULT\_THEME

```ts
const DEFAULT_THEME: {
  --er-color-primary: "#1a73e8";
  --er-color-match: "#34a853";
  --er-color-nonmatch: "#ea4335";
  --er-color-prior: "#9aa0a6";
  --er-color-background: "#ffffff";
  --er-color-text: "#202124";
  --er-color-border: "#dadce0";
  --er-font-family: "system-ui, -apple-system, sans-serif";
  --er-font-size-sm: "12px";
  --er-font-size-md: "14px";
  --er-font-size-lg: "18px";
  --er-bar-height: "24px";
  --er-bar-gap: "4px";
  --er-border-radius: "4px";
  --er-shadow: "0 1px 3px rgba(0,0,0,0.12)";
  --er-transition: "200ms ease";
  --er-max-width: "800px";
};
```

Defined in: [components/web/elements.ts:17](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L17)

Default CSS custom properties for theming. Consumers override these.

#### Type Declaration

| Name | Type | Default value | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="property-er-color-primary"></a> `--er-color-primary` | `"#1a73e8"` | `'#1a73e8'` | [components/web/elements.ts:18](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L18) |
| <a id="property-er-color-match"></a> `--er-color-match` | `"#34a853"` | `'#34a853'` | [components/web/elements.ts:19](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L19) |
| <a id="property-er-color-nonmatch"></a> `--er-color-nonmatch` | `"#ea4335"` | `'#ea4335'` | [components/web/elements.ts:20](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L20) |
| <a id="property-er-color-prior"></a> `--er-color-prior` | `"#9aa0a6"` | `'#9aa0a6'` | [components/web/elements.ts:21](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L21) |
| <a id="property-er-color-background"></a> `--er-color-background` | `"#ffffff"` | `'#ffffff'` | [components/web/elements.ts:22](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L22) |
| <a id="property-er-color-text"></a> `--er-color-text` | `"#202124"` | `'#202124'` | [components/web/elements.ts:23](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L23) |
| <a id="property-er-color-border"></a> `--er-color-border` | `"#dadce0"` | `'#dadce0'` | [components/web/elements.ts:24](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L24) |
| <a id="property-er-font-family"></a> `--er-font-family` | `"system-ui, -apple-system, sans-serif"` | `'system-ui, -apple-system, sans-serif'` | [components/web/elements.ts:25](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L25) |
| <a id="property-er-font-size-sm"></a> `--er-font-size-sm` | `"12px"` | `'12px'` | [components/web/elements.ts:26](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L26) |
| <a id="property-er-font-size-md"></a> `--er-font-size-md` | `"14px"` | `'14px'` | [components/web/elements.ts:27](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L27) |
| <a id="property-er-font-size-lg"></a> `--er-font-size-lg` | `"18px"` | `'18px'` | [components/web/elements.ts:28](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L28) |
| <a id="property-er-bar-height"></a> `--er-bar-height` | `"24px"` | `'24px'` | [components/web/elements.ts:29](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L29) |
| <a id="property-er-bar-gap"></a> `--er-bar-gap` | `"4px"` | `'4px'` | [components/web/elements.ts:30](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L30) |
| <a id="property-er-border-radius"></a> `--er-border-radius` | `"4px"` | `'4px'` | [components/web/elements.ts:31](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L31) |
| <a id="property-er-shadow"></a> `--er-shadow` | `"0 1px 3px rgba(0,0,0,0.12)"` | `'0 1px 3px rgba(0,0,0,0.12)'` | [components/web/elements.ts:32](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L32) |
| <a id="property-er-transition"></a> `--er-transition` | `"200ms ease"` | `'200ms ease'` | [components/web/elements.ts:33](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L33) |
| <a id="property-er-max-width"></a> `--er-max-width` | `"800px"` | `'800px'` | [components/web/elements.ts:34](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L34) |

***

### THEME\_VARIABLE\_COUNT

```ts
const THEME_VARIABLE_COUNT: number;
```

Defined in: [components/web/elements.ts:38](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L38)

Number of customizable theme variables.

## Functions

### registerAllElements()

```ts
function registerAllElements(): void;
```

Defined in: [components/web/elements.ts:291](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/components/web/elements.ts#L291)

Register all custom elements. Call once at app startup.

#### Returns

`void`

***

### buildWaterfallData()

```ts
function buildWaterfallData(result, pairIndex): WaterfallChartData;
```

Defined in: [data/api.ts:34](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L34)

Build waterfall chart data from a pipeline result.
Shows how each field contributes to the total match weight.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | `PipelineResult` |
| `pairIndex` | `number` |

#### Returns

[`WaterfallChartData`](#waterfallchartdata)

***

### buildHistogramData()

```ts
function buildHistogramData(result, threshold?): HistogramData;
```

Defined in: [data/api.ts:102](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L102)

Build match weight histogram data from pipeline diagnostics.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | `PipelineResult` |
| `threshold?` | `number` |

#### Returns

[`HistogramData`](#histogramdata)

***

### buildMuChartData()

```ts
function buildMuChartData(result, lambda?): MuChartData;
```

Defined in: [data/api.ts:185](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L185)

Build m/u parameter chart data from pipeline diagnostics.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | `PipelineResult` |
| `lambda?` | `number` |

#### Returns

[`MuChartData`](#muchartdata)

***

### buildClusterData()

```ts
function buildClusterData(result, _records?): ClusterExplorerData;
```

Defined in: [data/api.ts:237](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L237)

Build cluster tree data for interactive exploration.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | `PipelineResult` |
| `_records?` | readonly `Record`\<`string`, `unknown`\>[] |

#### Returns

[`ClusterExplorerData`](#clusterexplorerdata)

***

### buildEvaluationData()

```ts
function buildEvaluationData(metrics): EvaluationRadarData;
```

Defined in: [data/api.ts:292](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L292)

Build 12-axis evaluation radar chart data from evaluation metrics.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `metrics` | \{ `pairwisePrecision`: `number`; `pairwiseRecall`: `number`; `pairwiseF1`: `number`; `clusterPrecision`: `number`; `clusterRecall`: `number`; `clusterF1`: `number`; `bCubedPrecision`: `number`; `bCubedRecall`: `number`; `bCubedF1`: `number`; `adjustedRandIndex`: `number`; `fowlkesMallowsIndex`: `number`; `vMeasure`: `number`; \} |
| `metrics.pairwisePrecision` | `number` |
| `metrics.pairwiseRecall` | `number` |
| `metrics.pairwiseF1` | `number` |
| `metrics.clusterPrecision` | `number` |
| `metrics.clusterRecall` | `number` |
| `metrics.clusterF1` | `number` |
| `metrics.bCubedPrecision` | `number` |
| `metrics.bCubedRecall` | `number` |
| `metrics.bCubedF1` | `number` |
| `metrics.adjustedRandIndex` | `number` |
| `metrics.fowlkesMallowsIndex` | `number` |
| `metrics.vMeasure` | `number` |

#### Returns

[`EvaluationRadarData`](#evaluationradardata)

***

### buildUnlinkablesData()

```ts
function buildUnlinkablesData(result): UnlinkablesData;
```

Defined in: [data/api.ts:339](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/data/api.ts#L339)

Build unlinkables analysis from pipeline statistics.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | `PipelineResult` |

#### Returns

[`UnlinkablesData`](#unlinkablesdata)

***

### useWaterfall()

```ts
function useWaterfall(): {
  state: WaterfallState;
  actions: WaterfallActions;
};
```

Defined in: [headless/state-machines.ts:29](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L29)

#### Returns

```ts
{
  state: WaterfallState;
  actions: WaterfallActions;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `state` | [`WaterfallState`](#waterfallstate) | [headless/state-machines.ts:29](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L29) |
| `actions` | [`WaterfallActions`](#waterfallactions) | [headless/state-machines.ts:29](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L29) |

***

### useHistogram()

```ts
function useHistogram(): {
  state: HistogramState;
  actions: HistogramActions;
};
```

Defined in: [headless/state-machines.ts:71](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L71)

#### Returns

```ts
{
  state: HistogramState;
  actions: HistogramActions;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `state` | [`HistogramState`](#histogramstate) | [headless/state-machines.ts:71](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L71) |
| `actions` | [`HistogramActions`](#histogramactions) | [headless/state-machines.ts:71](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L71) |

***

### useClusterExplorer()

```ts
function useClusterExplorer(): {
  state: ClusterExplorerState;
  actions: ClusterExplorerActions;
};
```

Defined in: [headless/state-machines.ts:115](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L115)

#### Returns

```ts
{
  state: ClusterExplorerState;
  actions: ClusterExplorerActions;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `state` | [`ClusterExplorerState`](#clusterexplorerstate) | [headless/state-machines.ts:116](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L116) |
| `actions` | [`ClusterExplorerActions`](#clusterexploreractions) | [headless/state-machines.ts:117](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L117) |

***

### useMuChart()

```ts
function useMuChart(): {
  state: MuChartState;
  actions: MuChartActions;
};
```

Defined in: [headless/state-machines.ts:180](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L180)

#### Returns

```ts
{
  state: MuChartState;
  actions: MuChartActions;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `state` | [`MuChartState`](#muchartstate) | [headless/state-machines.ts:180](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L180) |
| `actions` | [`MuChartActions`](#muchartactions) | [headless/state-machines.ts:180](https://github.com/AgentiX-E/entity-resolution/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolution-visual/src/headless/state-machines.ts#L180) |
