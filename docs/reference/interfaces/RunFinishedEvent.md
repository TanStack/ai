---
id: RunFinishedEvent
title: RunFinishedEvent
---

Defined in: [packages/ai/src/types.ts:1626](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1626)

Emitted when a run completes successfully.

@ag-ui/core provides: `threadId`, `runId`, `result?`, `outcome?`
Spec `usage[]` is provider/model token counts. TanStack leftovers live in
`metadata.tanstack`.

## Extends

- `Pick`\<`AGUIRunFinishedEvent`, `"threadId"` \| `"runId"` \| `"result"` \| `"outcome"` \| `"timestamp"` \| `"rawEvent"`\>

## Properties

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:1637](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1637)

Restored on the client from `metadata.tanstack`.

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1638)

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

Defined in: [packages/ai/src/types.ts:1633](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1633)

Restored on the client from `metadata.tanstack`.

***

### responseId?

```ts
optional responseId?: string;
```

Defined in: [packages/ai/src/types.ts:1635](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1635)

Provider generation ID. Restored from `metadata.tanstack`.

***

### type

```ts
type: RUN_FINISHED;
```

Defined in: [packages/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1630)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1631](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1631)
