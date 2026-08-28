---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/ai/src/types.ts:1205](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1205)

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

Defined in: [packages/ai/src/types.ts:1214](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1214)

Restored on the client from `metadata.tanstack`.

***

### metadata?

```ts
optional metadata?: object & Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1215](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1215)

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

Defined in: [packages/ai/src/types.ts:1212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1212)

Restored on the client from `metadata.tanstack`.

***

### type

```ts
type: RUN_FINISHED;
```

Defined in: [packages/ai/src/types.ts:1209](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1209)

***

### usage?

```ts
optional usage?: 
  | TokenUsage<ProviderUsageDetails>
  | SpecTokenUsage[];
```

Defined in: [packages/ai/src/types.ts:1210](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1210)
