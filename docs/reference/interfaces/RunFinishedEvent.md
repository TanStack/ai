---
id: RunFinishedEvent
title: RunFinishedEvent
---

Defined in: [packages/ai/src/types.ts:1227](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1227)

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

Defined in: [packages/ai/src/types.ts:1236](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1236)

Restored on the client from `metadata.tanstack`.

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1237](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1237)

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

Defined in: [packages/ai/src/types.ts:1234](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1234)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_FINISHED;
```

Defined in: [packages/ai/src/types.ts:1231](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1231)

***

### usage?

```ts
optional usage?: 
  | TokenUsage<ProviderUsageDetails>
  | SpecTokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1232)
