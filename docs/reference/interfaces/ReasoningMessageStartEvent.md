---
id: ReasoningMessageStartEvent
title: ReasoningMessageStartEvent
---

# Interface: ReasoningMessageStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1068](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1068)

Emitted when a reasoning message starts.

@ag-ui/core provides: `messageId`, `role` ("reasoning")
TanStack AI adds: `model?`

## Extends

- `ReasoningMessageStartEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1070](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1070)

Model identifier for multi-model support
