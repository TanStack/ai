---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/ai/src/types.ts:1077](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1077)

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

Defined in: [packages/ai/src/types.ts:1081](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1081)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1079](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1079)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1083](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1083)

Token usage statistics with optional detailed breakdowns and provider-reported cost.
