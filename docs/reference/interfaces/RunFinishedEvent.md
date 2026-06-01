---
id: RunFinishedEvent
title: RunFinishedEvent
---

# Interface: RunFinishedEvent

Defined in: [packages/ai/src/types.ts:1020](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1020)

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

Defined in: [packages/ai/src/types.ts:1024](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1024)

Why the generation stopped

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1022](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1022)

Model identifier for multi-model support

***

### usage?

```ts
optional usage: UsageTotals;
```

Defined in: [packages/ai/src/types.ts:1026](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1026)

Token usage statistics, optionally including provider-reported cost.
