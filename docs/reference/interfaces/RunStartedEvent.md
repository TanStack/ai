---
id: RunStartedEvent
title: RunStartedEvent
---

# Interface: RunStartedEvent

Defined in: [packages/ai/src/types.ts:957](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L957)

Emitted when a run starts.
This is the first event in any streaming response.

@ag-ui/core provides: `threadId`, `runId`, `parentRunId?`, `input?`
TanStack AI adds: `model?`

## Extends

- `RunStartedEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:959](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L959)

Model identifier for multi-model support
