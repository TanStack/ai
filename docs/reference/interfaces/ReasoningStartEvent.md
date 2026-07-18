---
id: ReasoningStartEvent
title: ReasoningStartEvent
---

# Interface: ReasoningStartEvent

Defined in: [packages/ai/src/types.ts:1540](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1540)

Emitted when reasoning starts for a message.

@ag-ui/core provides: `messageId`
TanStack AI adds: `model?`

## Extends

- `ReasoningStartEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1542](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1542)

Model identifier for multi-model support
