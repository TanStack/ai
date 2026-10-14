---
id: RunFinishedEvent
title: RunFinishedEvent
---

Defined in: [packages/ai/src/types.ts:1590](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1590)

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

Defined in: [packages/ai/src/types.ts:1601](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1601)

Restored on the client from `metadata.tanstack`.

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1602](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1602)

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

Defined in: [packages/ai/src/types.ts:1597](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1597)

Restored on the client from `metadata.tanstack`.

***

### responseId?

```ts
optional responseId?: string;
```

Defined in: [packages/ai/src/types.ts:1599](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1599)

Provider generation ID. Restored from `metadata.tanstack`.

***

### type

```ts
type: RUN_FINISHED;
```

Defined in: [packages/ai/src/types.ts:1594](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1594)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1595)
