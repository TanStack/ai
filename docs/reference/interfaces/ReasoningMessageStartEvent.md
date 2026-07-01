---
id: ReasoningMessageStartEvent
title: ReasoningMessageStartEvent
---

# Interface: ReasoningMessageStartEvent

Defined in: [packages/ai/src/types.ts:1421](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1421)

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

Defined in: [packages/ai/src/types.ts:1423](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1423)

Model identifier for multi-model support
