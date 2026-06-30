---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/ai/src/types.ts:1434](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1434)

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

Defined in: [packages/ai/src/types.ts:1436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1436)

Model identifier for multi-model support
