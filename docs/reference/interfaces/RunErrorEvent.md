---
id: RunErrorEvent
title: RunErrorEvent
---

Defined in: [packages/ai/src/types.ts:1612](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1612)

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

Defined in: [packages/ai/src/types.ts:1625](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1625)

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

Defined in: [packages/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1632)

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

Defined in: [packages/ai/src/types.ts:1623](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1623)

Restored on the client from `metadata.tanstack`.

***

### retryAfterMs?

```ts
optional retryAfterMs?: number;
```

Defined in: [packages/ai/src/types.ts:1631](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1631)

How long the provider asks you to wait before a retry, in milliseconds.
Adapters read it from the `retry-after-ms` or `retry-after` header.
`chat()` moves it to `metadata.tanstack.retryAfterMs`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1621](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1621)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1619](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1619)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1616](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1616)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1617](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1617)
