---
id: ConsoleLogger
title: ConsoleLogger
---

# Class: ConsoleLogger

Defined in: [packages/ai/src/logger/console-logger.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/console-logger.ts#L101)

Default `Logger` implementation that routes each level to the matching
`console` method:

- `debug` → `console.debug`
- `info` → `console.info`
- `warn` → `console.warn`
- `error` → `console.error`

When a `meta` object is supplied it is rendered with the strategy that
actually surfaces it on the current runtime (see MetaStrategy):
depth-unlimited `console.dir` on Node, circular-safe JSON on Cloudflare
Workers, and an extra console argument everywhere else.

This is the logger used when `debug` is enabled on any activity and no
custom `logger` is supplied via `debug: { logger }`.

## Implements

- [`Logger`](../interfaces/Logger.md)

## Constructors

### Constructor

```ts
new ConsoleLogger(): ConsoleLogger;
```

#### Returns

`ConsoleLogger`

## Methods

### debug()

```ts
debug(message, meta?): void;
```

Defined in: [packages/ai/src/logger/console-logger.ts:103](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/console-logger.ts#L103)

Log a debug-level message; forwards to `console.debug`.

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`debug`](../interfaces/Logger.md#debug)

***

### error()

```ts
error(message, meta?): void;
```

Defined in: [packages/ai/src/logger/console-logger.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/console-logger.ts#L118)

Log an error-level message; forwards to `console.error`.

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`error`](../interfaces/Logger.md#error)

***

### info()

```ts
info(message, meta?): void;
```

Defined in: [packages/ai/src/logger/console-logger.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/console-logger.ts#L108)

Log an info-level message; forwards to `console.info`.

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`info`](../interfaces/Logger.md#info)

***

### warn()

```ts
warn(message, meta?): void;
```

Defined in: [packages/ai/src/logger/console-logger.ts:113](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/console-logger.ts#L113)

Log a warning-level message; forwards to `console.warn`.

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

#### Implementation of

[`Logger`](../interfaces/Logger.md).[`warn`](../interfaces/Logger.md#warn)
