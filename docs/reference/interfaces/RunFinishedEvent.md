---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/ai/src/types.ts:985](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L985)

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

Defined in: [packages/ai/src/types.ts:989](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L989)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:987](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L987)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:991](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L991)

Token usage statistics with optional detailed breakdowns and provider-reported cost.
