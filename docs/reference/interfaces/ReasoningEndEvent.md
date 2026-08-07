---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/ai/src/types.ts:1616](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1616)

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

Defined in: [packages/ai/src/types.ts:1618](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1618)

Model identifier for multi-model support
