---
id: RunErrorEvent
title: RunErrorEvent
---

Defined in: [packages/ai/src/types.ts:1663](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1663)

Emitted when an error occurs during a run.

@ag-ui/core provides: `message`, `code?`
Spec `usage[]` is provider/model token counts. Interrupt errors live in
`metadata.tanstack.interruptErrors`.

## Extends

- `Pick`\<`AGUIRunErrorEvent`, `"message"` \| `"code"` \| `"timestamp"` \| `"rawEvent"`\>

## Properties

### error?

```ts
optional error?: object;
```

Defined in: [packages/ai/src/types.ts:1676](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1676)

Nested payload kept for in-process / durability consumers.

#### code?

```ts
optional code?: string;
```

#### message

```ts
message: string;
```

***

### errorType?

```ts
optional errorType?: string;
```

Defined in: [packages/ai/src/types.ts:1694](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1694)

The provider's error type, for example `overloaded_error` or
`rate_limit_exceeded`. `code` stays the HTTP status. A string of at most
128 characters. `chat()` moves it to `metadata.tanstack.errorType`.

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1701](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1701)

#### Type Declaration

##### tanstack?

```ts
optional tanstack?: TanStackRunMetadata;
```

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1674](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1674)

Restored on the client from `metadata.tanstack`.

***

### rawText?

```ts
optional rawText?: string;
```

Defined in: [packages/ai/src/types.ts:1682](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1682)

The model text of a failed structured output: JSON that did not parse,
or a value that failed the `outputSchema` check. `chat()` moves it to
`metadata.tanstack.rawText`.

***

### requestId?

```ts
optional requestId?: string;
```

Defined in: [packages/ai/src/types.ts:1700](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1700)

The provider's request id, from the SDK error or the `request-id` /
`x-request-id` header. Give it to the provider's support.
`chat()` moves it to `metadata.tanstack.requestId`.

***

### retryAfterMs?

```ts
optional retryAfterMs?: number;
```

Defined in: [packages/ai/src/types.ts:1688](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1688)

How long the provider asks you to wait before a retry, in milliseconds.
Adapters read it from the `retry-after-ms` or `retry-after` header.
`chat()` moves it to `metadata.tanstack.retryAfterMs`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1672](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1672)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1670](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1670)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1667)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1668](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1668)
