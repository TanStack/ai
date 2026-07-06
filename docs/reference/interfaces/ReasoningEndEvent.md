---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/ai/src/types.ts:1476](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1476)

Emitted when reasoning ends for a message.

@ag-ui/core provides: `messageId`
TanStack AI adds: `model?`

## Extends

- `ReasoningEndEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1478)

Model identifier for multi-model support
