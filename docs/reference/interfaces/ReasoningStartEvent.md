---
id: ReasoningStartEvent
title: ReasoningStartEvent
---

# Interface: ReasoningStartEvent

Defined in: [packages/ai/src/types.ts:1371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1371)

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

Defined in: [packages/ai/src/types.ts:1373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1373)

Model identifier for multi-model support
