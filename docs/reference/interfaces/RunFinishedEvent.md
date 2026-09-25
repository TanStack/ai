---
id: RunFinishedEvent
title: RunFinishedEvent
---

Defined in: [packages/ai/src/types.ts:1267](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1267)

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

Defined in: [packages/ai/src/types.ts:1276](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1276)

Restored on the client from `metadata.tanstack`.

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1277](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1277)

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

Defined in: [packages/ai/src/types.ts:1274](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1274)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_FINISHED;
```

Defined in: [packages/ai/src/types.ts:1271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1271)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1272](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1272)
