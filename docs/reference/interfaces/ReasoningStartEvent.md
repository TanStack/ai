---
id: ReasoningStartEvent
title: ReasoningStartEvent
---

# Interface: ReasoningStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1062](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1062)

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

Defined in: [packages/typescript/ai/src/types.ts:1064](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1064)

Model identifier for multi-model support
