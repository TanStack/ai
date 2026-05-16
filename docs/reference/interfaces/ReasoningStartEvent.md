---
id: ReasoningStartEvent
title: ReasoningStartEvent
---

# Interface: ReasoningStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1201](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1201)

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

Defined in: [packages/typescript/ai/src/types.ts:1203](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1203)

Model identifier for multi-model support
