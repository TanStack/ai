---
id: RunStartedEvent
title: RunStartedEvent
---

# Interface: RunStartedEvent

Defined in: [packages/typescript/ai/src/types.ts:904](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L904)

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

Defined in: [packages/typescript/ai/src/types.ts:906](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L906)

Model identifier for multi-model support
