---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/ai/src/types.ts:1722](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1722)

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
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1724](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1724)

Model identifier for multi-model support
