---
id: Logger
title: Logger
---

# Interface: Logger

Defined in: [packages/typescript/ai/src/logger/types.ts:4](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L4)

Pluggable logger interface consumed by every `@tanstack/ai` activity when `debug` is enabled. Supply a custom implementation via `debug: { logger }` on `chat()`, `summarize()`, `generateImage()`, etc. The four methods correspond to log levels: use `debug` for chunk-level diagnostic output, `info`/`warn` for notable events, `error` for caught exceptions.

## Properties

### debug()

```ts
debug: (message, meta?) => void;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:9](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L9)

Called for chunk-level diagnostic output (raw provider chunks, per-chunk output, agent-loop iteration markers).

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.

#### Returns

`void`

***

### error()

```ts
error: (message, meta?) => void;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:24](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L24)

Called for caught exceptions throughout the pipeline.

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.

#### Returns

`void`

***

### info()

```ts
info: (message, meta?) => void;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:14](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L14)

Called for notable informational events (outgoing requests, tool invocations, middleware transitions).

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.

#### Returns

`void`

***

### warn()

```ts
warn: (message, meta?) => void;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:19](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L19)

Called for notable warnings that don't halt execution (deprecations, recoverable anomalies).

#### Parameters

##### message

`string`

##### meta?

`Record`\<`string`, `unknown`\>

Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.

#### Returns

`void`
