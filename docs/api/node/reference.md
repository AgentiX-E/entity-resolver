## Classes

### DuckDBStore

Defined in: [storage/duckdb-store.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L16)

DuckDB-backed IEntityStore.
Member IDs are stored as JSON strings for DuckDB Node.js binding compatibility.

#### Constructors

##### Constructor

```ts
new DuckDBStore(db): DuckDBStore;
```

Defined in: [storage/duckdb-store.ts:21](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L21)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `db` | `any` |

###### Returns

[`DuckDBStore`](#duckdbstore)

#### Methods

##### create()

```ts
static create(config?): Promise<DuckDBStore>;
```

Defined in: [storage/duckdb-store.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L26)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `config?` | [`DuckDBStoreConfig`](#duckdbstoreconfig) |

###### Returns

`Promise`\<[`DuckDBStore`](#duckdbstore)\>

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

Defined in: [storage/duckdb-store.ts:50](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L50)

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
queryNeighbors(_id, _hops?): Promise<{
  clusterId: string;
  memberIds: number[];
  cohesion: number;
}[]>;
```

Defined in: [storage/duckdb-store.ts:69](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L69)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `_id` | `string` |
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

Defined in: [storage/duckdb-store.ts:86](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L86)

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

Defined in: [storage/duckdb-store.ts:97](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L97)

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

Defined in: [storage/duckdb-store.ts:104](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L104)

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

Defined in: [storage/duckdb-store.ts:115](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L115)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityId` | `string` |
| `memberGroups` | `string`[][] |

###### Returns

`Promise`\<`void`\>

##### close()

```ts
close(): Promise<void>;
```

Defined in: [storage/duckdb-store.ts:127](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L127)

###### Returns

`Promise`\<`void`\>

***

### PgEntityStore

Defined in: [storage/pg-store.ts:93](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L93)

#### Constructors

##### Constructor

```ts
new PgEntityStore(pool, _schema?): PgEntityStore;
```

Defined in: [storage/pg-store.ts:97](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L97)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `pool` | `Pool` |
| `_schema?` | `string` |

###### Returns

[`PgEntityStore`](#pgentitystore)

#### Methods

##### create()

```ts
static create(config): Promise<PgEntityStore>;
```

Defined in: [storage/pg-store.ts:102](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L102)

Create a store from configuration. Connects with full mTLS support.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `config` | [`PgStoreConfig`](#pgstoreconfig) |

###### Returns

`Promise`\<[`PgEntityStore`](#pgentitystore)\>

##### migrate()

```ts
migrate(): Promise<void>;
```

Defined in: [storage/pg-store.ts:112](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L112)

Run schema migration.

###### Returns

`Promise`\<`void`\>

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

Defined in: [storage/pg-store.ts:117](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L117)

Get an entity by its cluster ID.

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
queryNeighbors(id, hops?): Promise<{
  clusterId: string;
  memberIds: number[];
  cohesion: number;
}[]>;
```

Defined in: [storage/pg-store.ts:128](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L128)

Query neighboring entities by member overlap.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `hops?` | `number` |

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

Defined in: [storage/pg-store.ts:142](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L142)

Upsert an entity.

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

Defined in: [storage/pg-store.ts:155](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L155)

Delete an entity.

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

Defined in: [storage/pg-store.ts:160](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L160)

Merge two entities.

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

Defined in: [storage/pg-store.ts:187](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L187)

Split an entity into multiple groups.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityId` | `string` |
| `memberGroups` | `string`[][] |

###### Returns

`Promise`\<`void`\>

##### close()

```ts
close(): Promise<void>;
```

Defined in: [storage/pg-store.ts:208](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L208)

Close the connection pool gracefully.

###### Returns

`Promise`\<`void`\>

## Interfaces

### ResolvedStorage

Defined in: [storage-resolver.ts:3](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage-resolver.ts#L3)

#### Properties

##### backend

```ts
readonly backend: "postgres" | "duckdb" | "memory";
```

Defined in: [storage-resolver.ts:4](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage-resolver.ts#L4)

##### store

```ts
readonly store: Record<string, unknown> & {
  getEntity: (id) => Promise<unknown>;
  queryNeighbors: (id, hops?) => Promise<unknown[]>;
  upsertEntity: (e) => Promise<void>;
  deleteEntity: (id) => Promise<void>;
  applyMerge: (from, into) => Promise<void>;
  applySplit: (entityId, groups) => Promise<void>;
  close?: () => Promise<void>;
};
```

Defined in: [storage-resolver.ts:5](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage-resolver.ts#L5)

###### Type Declaration

###### getEntity

```ts
getEntity: (id) => Promise<unknown>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<`unknown`\>

###### queryNeighbors

```ts
queryNeighbors: (id, hops?) => Promise<unknown[]>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `hops?` | `number` |

###### Returns

`Promise`\<`unknown`[]\>

###### upsertEntity

```ts
upsertEntity: (e) => Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

###### Returns

`Promise`\<`void`\>

###### deleteEntity

```ts
deleteEntity: (id) => Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<`void`\>

###### applyMerge

```ts
applyMerge: (from, into) => Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `from` | `string` |
| `into` | `string` |

###### Returns

`Promise`\<`void`\>

###### applySplit

```ts
applySplit: (entityId, groups) => Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `entityId` | `string` |
| `groups` | `string`[][] |

###### Returns

`Promise`\<`void`\>

###### close?

```ts
optional close?: () => Promise<void>;
```

###### Returns

`Promise`\<`void`\>

***

### DuckDBStoreConfig

Defined in: [storage/duckdb-store.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L8)

#### Properties

##### path?

```ts
readonly optional path?: string;
```

Defined in: [storage/duckdb-store.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/duckdb-store.ts#L9)

***

### PgTlsConfig

Defined in: [storage/pg-store.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L9)

mTLS configuration — all paths in PEM format.

#### Properties

##### ca?

```ts
readonly optional ca?: string;
```

Defined in: [storage/pg-store.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L11)

Path to CA certificate (PEM).

##### cert?

```ts
readonly optional cert?: string;
```

Defined in: [storage/pg-store.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L13)

Path to client certificate for mutual TLS (PEM).

##### key?

```ts
readonly optional key?: string;
```

Defined in: [storage/pg-store.ts:15](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L15)

Path to client private key for mutual TLS (PEM).

##### servername?

```ts
readonly optional servername?: string;
```

Defined in: [storage/pg-store.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L17)

Server Name Indication override.

##### rejectUnauthorized?

```ts
readonly optional rejectUnauthorized?: boolean;
```

Defined in: [storage/pg-store.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L19)

Reject unauthorized certificates (default: true).

***

### PgStoreConfig

Defined in: [storage/pg-store.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L23)

PostgreSQL connection configuration.

#### Properties

##### host?

```ts
readonly optional host?: string;
```

Defined in: [storage/pg-store.ts:24](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L24)

##### port?

```ts
readonly optional port?: number;
```

Defined in: [storage/pg-store.ts:25](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L25)

##### database

```ts
readonly database: string;
```

Defined in: [storage/pg-store.ts:26](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L26)

##### user?

```ts
readonly optional user?: string;
```

Defined in: [storage/pg-store.ts:27](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L27)

##### password?

```ts
readonly optional password?: string;
```

Defined in: [storage/pg-store.ts:28](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L28)

##### tls?

```ts
readonly optional tls?: PgTlsConfig;
```

Defined in: [storage/pg-store.ts:29](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L29)

##### poolSize?

```ts
readonly optional poolSize?: number;
```

Defined in: [storage/pg-store.ts:30](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L30)

##### \_schema?

```ts
readonly optional _schema?: string;
```

Defined in: [storage/pg-store.ts:32](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L32)

Schema name for ER tables. Default: 'public'.

## Variables

### ER\_SCHEMA\_SQL

```ts
const ER_SCHEMA_SQL: "\nCREATE TABLE IF NOT EXISTS er_entities (\n  cluster_id   TEXT PRIMARY KEY,\n  member_ids   INTEGER[] NOT NULL DEFAULT '{}',\n  cohesion     DOUBLE PRECISION DEFAULT 0,\n  created_at   TIMESTAMPTZ DEFAULT NOW(),\n  updated_at   TIMESTAMPTZ DEFAULT NOW()\n);\n\nCREATE INDEX IF NOT EXISTS idx_er_entities_updated\n  ON er_entities (updated_at DESC);\n";
```

Defined in: [storage/pg-store.ts:39](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L39)

## Functions

### resolveStorage()

```ts
function resolveStorage(options?): Promise<ResolvedStorage>;
```

Defined in: [storage-resolver.ts:16](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage-resolver.ts#L16)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | \{ `backend?`: `"postgres"` \| `"duckdb"` \| `"memory"`; `duckdbPath?`: `string`; `pgConfig?`: `Record`\<`string`, `unknown`\>; \} |
| `options.backend?` | `"postgres"` \| `"duckdb"` \| `"memory"` |
| `options.duckdbPath?` | `string` |
| `options.pgConfig?` | `Record`\<`string`, `unknown`\> |

#### Returns

`Promise`\<[`ResolvedStorage`](#resolvedstorage)\>

***

### buildPoolConfig()

```ts
function buildPoolConfig(config): PoolConfig;
```

Defined in: [storage/pg-store.ts:56](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-node/src/storage/pg-store.ts#L56)

Build a pg PoolConfig from our config with mTLS support.
This is a pure function — testable without a real database.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `config` | [`PgStoreConfig`](#pgstoreconfig) |

#### Returns

`PoolConfig`
