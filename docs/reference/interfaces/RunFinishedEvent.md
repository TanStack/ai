---
id: RunFinishedEvent
title: RunFinishedEvent
---

Defined in: [packages/ai/src/types.ts:1251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1251)

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

Defined in: [packages/ai/src/types.ts:1260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1260)

Restored on the client from `metadata.tanstack`.

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1261)

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

Defined in: [packages/ai/src/types.ts:1258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1258)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_FINISHED;
```

Defined in: [packages/ai/src/types.ts:1255](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1255)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails> | TokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1256)
