---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/ai/src/types.ts:1593](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1593)

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

Defined in: [packages/ai/src/types.ts:1595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1595)

Model identifier for multi-model support
