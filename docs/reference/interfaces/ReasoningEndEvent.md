---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1101)

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

Defined in: [packages/typescript/ai/src/types.ts:1103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1103)

Model identifier for multi-model support
