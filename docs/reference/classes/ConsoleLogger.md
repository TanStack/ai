---
id: ConsoleLogger
title: ConsoleLogger
---

# Class: ConsoleLogger

Defined in: [packages/typescript/ai/src/logger/console-logger.ts:25](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/console-logger.ts#L25)

Pluggable logger interface consumed by every `@tanstack/ai` activity when `debug` is enabled. Supply a custom implementation via `debug: { logger }` on `chat()`, `summarize()`, `generateImage()`, etc. The four methods correspond to log levels: use `debug` for chunk-level diagnostic output, `info`/`warn` for notable events, `error` for caught exceptions.

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

Defined in: [packages/typescript/ai/src/logger/console-logger.ts:27](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/console-logger.ts#L27)

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

Defined in: [packages/typescript/ai/src/logger/console-logger.ts:45](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/console-logger.ts#L45)

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

Defined in: [packages/typescript/ai/src/logger/console-logger.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/console-logger.ts#L33)

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

Defined in: [packages/typescript/ai/src/logger/console-logger.ts:39](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/console-logger.ts#L39)

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
