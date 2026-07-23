## Interfaces

### McpTool

Defined in: [mcp/tools.ts:5](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/mcp/tools.ts#L5)

MCP tool definition.

#### Properties

##### name

```ts
readonly name: string;
```

Defined in: [mcp/tools.ts:6](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/mcp/tools.ts#L6)

##### description

```ts
readonly description: string;
```

Defined in: [mcp/tools.ts:7](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/mcp/tools.ts#L7)

##### parameters

```ts
readonly parameters: Record<string, unknown>;
```

Defined in: [mcp/tools.ts:8](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/mcp/tools.ts#L8)

***

### AuthConfig

Defined in: [middleware/auth.ts:7](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/auth.ts#L7)

Auth configuration.

#### Properties

##### apiKeys?

```ts
readonly optional apiKeys?: readonly string[];
```

Defined in: [middleware/auth.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/auth.ts#L9)

Valid API keys. If set, `Authorization: Bearer <key>` is accepted.

##### jwtSecret?

```ts
readonly optional jwtSecret?: string;
```

Defined in: [middleware/auth.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/auth.ts#L11)

JWT secret for token validation. If set, JWT tokens are accepted.

##### allowUnauthenticated?

```ts
readonly optional allowUnauthenticated?: boolean;
```

Defined in: [middleware/auth.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/auth.ts#L13)

Whether to allow unauthenticated requests (dev mode). Default: false.

***

### RateLimitConfig

Defined in: [middleware/rate-limit.ts:7](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/rate-limit.ts#L7)

Rate limit configuration.

#### Properties

##### maxRequests?

```ts
readonly optional maxRequests?: number;
```

Defined in: [middleware/rate-limit.ts:9](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/rate-limit.ts#L9)

Maximum requests allowed in the window. Default: 100.

##### windowMs?

```ts
readonly optional windowMs?: number;
```

Defined in: [middleware/rate-limit.ts:11](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/rate-limit.ts#L11)

Time window in milliseconds. Default: 60000 (1 minute).

##### keyGenerator?

```ts
readonly optional keyGenerator?: (c) => string;
```

Defined in: [middleware/rate-limit.ts:13](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/rate-limit.ts#L13)

Custom key generator (default: IP-based).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | `Context` |

###### Returns

`string`

***

### ServerConfig

Defined in: [rest/app.ts:17](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/rest/app.ts#L17)

Server configuration.

#### Properties

##### auth?

```ts
readonly optional auth?: AuthConfig;
```

Defined in: [rest/app.ts:18](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/rest/app.ts#L18)

##### rateLimit?

```ts
readonly optional rateLimit?: RateLimitConfig;
```

Defined in: [rest/app.ts:19](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/rest/app.ts#L19)

## Functions

### getMcpTools()

```ts
function getMcpTools(): McpTool[];
```

Defined in: [mcp/tools.ts:12](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/mcp/tools.ts#L12)

All available MCP tools.

#### Returns

[`McpTool`](#mcptool)[]

***

### createAuthMiddleware()

```ts
function createAuthMiddleware(config): (c, next) => Promise<
  | void
  | JSONRespondReturn<{
  error: string;
}, 401>
  | JSONRespondReturn<{
  error: string;
}, 403>>;
```

Defined in: [middleware/auth.ts:24](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/auth.ts#L24)

Create an auth middleware.

Supports three modes:
- API Key: `Authorization: Bearer sk-xxx` validated against apiKeys list
- JWT: `Authorization: Bearer <jwt>` validated against jwtSecret
- None: allowUnauthenticated=true (dev/test only)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `config` | [`AuthConfig`](#authconfig) |

#### Returns

(`c`, `next`) => `Promise`\<
  \| `void`
  \| `JSONRespondReturn`\<\{
  `error`: `string`;
\}, `401`\>
  \| `JSONRespondReturn`\<\{
  `error`: `string`;
\}, `403`\>\>

***

### createRateLimitMiddleware()

```ts
function createRateLimitMiddleware(config?): (c, next) => Promise<
  | void
  | JSONRespondReturn<{
  error: string;
  retryAfter: number;
}, 429>>;
```

Defined in: [middleware/rate-limit.ts:28](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/rate-limit.ts#L28)

Create a rate limiting middleware using token bucket algorithm.

Each client (identified by IP or custom key) gets a bucket
that refills at maxRequests/windowMs rate. Requests exceeding
the bucket return 429 Too Many Requests.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `config` | [`RateLimitConfig`](#ratelimitconfig) |

#### Returns

(`c`, `next`) => `Promise`\<
  \| `void`
  \| `JSONRespondReturn`\<\{
  `error`: `string`;
  `retryAfter`: `number`;
\}, `429`\>\>

***

### startBucketCleanup()

```ts
function startBucketCleanup(intervalMs?): () => void;
```

Defined in: [middleware/rate-limit.ts:72](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/middleware/rate-limit.ts#L72)

Clean up expired buckets periodically.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `intervalMs` | `number` | `300000` |

#### Returns

() => `void`

***

### createApp()

```ts
function createApp(config?): Hono;
```

Defined in: [rest/app.ts:23](https://github.com/AgentiX-E/entity-resolver/blob/e86fcfcf6d7f2b7e3adedb12bb963a8fab7791cc/packages/entity-resolver-server/src/rest/app.ts#L23)

Create the entity-resolver Hono app with production middleware.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `config` | [`ServerConfig`](#serverconfig) |

#### Returns

`Hono`
