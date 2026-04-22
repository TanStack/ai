---
id: ReasoningStartEvent
title: ReasoningStartEvent
---

# Interface: ReasoningStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1048](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1048)

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

Defined in: [packages/typescript/ai/src/types.ts:1050](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1050)

Model identifier for multi-model support
