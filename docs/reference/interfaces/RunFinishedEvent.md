---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/ai/src/types.ts:1068](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1068)

Emitted when a run completes successfully.

@ag-ui/core provides: `threadId`, `runId`, `result?`
TanStack AI adds: `model?`, `finishReason?`, `usage?`

## Extends

- `RunFinishedEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | "tool_calls" | null;
```

Defined in: [packages/ai/src/types.ts:1072](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1072)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1070](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1070)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1074](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1074)

Token usage statistics with optional detailed breakdowns and provider-reported cost.
