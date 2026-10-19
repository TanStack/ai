---
id: RunErrorEvent
title: RunErrorEvent
---

Defined in: [packages/ai/src/types.ts:1648](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1648)

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

Defined in: [packages/ai/src/types.ts:1661](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1661)

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

Defined in: [packages/ai/src/types.ts:1668](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1668)

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

Defined in: [packages/ai/src/types.ts:1659](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1659)

Restored on the client from `metadata.tanstack`.

***

### retryAfterMs?

```ts
optional retryAfterMs?: number;
```

Defined in: [packages/ai/src/types.ts:1667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1667)

How long the provider asks you to wait before a retry, in milliseconds.
Adapters read it from the `retry-after-ms` or `retry-after` header.
`chat()` moves it to `metadata.tanstack.retryAfterMs`.

***

### runId?

```ts
optional runId?: string;
```

Defined in: [packages/ai/src/types.ts:1657](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1657)

Restored on the client from `metadata.tanstack`.

***

### threadId?

```ts
optional threadId?: string;
```

Defined in: [packages/ai/src/types.ts:1655](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1655)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_ERROR;
```

Defined in: [packages/ai/src/types.ts:1652](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1652)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1653)
