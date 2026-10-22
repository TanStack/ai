---
id: RunErrorEvent
title: RunErrorEvent
---

Defined in: packages/ai/src/types.ts:1623

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

Defined in: packages/ai/src/types.ts:1636

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

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: packages/ai/src/types.ts:1643

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

Defined in: packages/ai/src/types.ts:1634

Restored on the client from `metadata.tanstack`.

***

### retryAfterMs?

```ts
optional retryAfterMs?: number;
```

Defined in: packages/ai/src/types.ts:1642

How long the provider asks you to wait before a retry, in milliseconds.
Adapters read it from the `retry-after-ms` or `retry-after` header.
`chat()` moves it to `metadata.tanstack.retryAfterMs`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: packages/ai/src/types.ts:1632

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: packages/ai/src/types.ts:1630

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: packages/ai/src/types.ts:1627

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: packages/ai/src/types.ts:1628
