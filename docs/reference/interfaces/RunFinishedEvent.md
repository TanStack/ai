---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/ai/src/types.ts:967](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L967)

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

Defined in: [packages/ai/src/types.ts:971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L971)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:969](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L969)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: UsageTotals;
```

Defined in: [packages/ai/src/types.ts:973](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L973)

Token usage statistics, optionally including provider-reported cost.
