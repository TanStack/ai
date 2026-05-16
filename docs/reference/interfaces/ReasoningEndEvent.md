---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1245](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1245)

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

Defined in: [packages/typescript/ai/src/types.ts:1247](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1247)

Model identifier for multi-model support
