---
id: ReasoningStartEvent
title: ReasoningStartEvent
---

# Interface: ReasoningStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1070](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1070)

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

Defined in: [packages/typescript/ai/src/types.ts:1072](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1072)

Model identifier for multi-model support
