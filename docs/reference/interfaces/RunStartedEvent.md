---
id: RunStartedEvent
title: RunStartedEvent
---

# Interface: RunStartedEvent

Defined in: [packages/typescript/ai/src/types.ts:810](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L810)

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

Defined in: [packages/typescript/ai/src/types.ts:812](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L812)

Model identifier for multi-model support
