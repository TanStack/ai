---
id: ReasoningMessageStartEvent
title: ReasoningMessageStartEvent
---

# Interface: ReasoningMessageStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1280](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1280)

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

Defined in: [packages/typescript/ai/src/types.ts:1282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1282)

Model identifier for multi-model support
