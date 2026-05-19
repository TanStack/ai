---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1293](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1293)

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

Defined in: [packages/typescript/ai/src/types.ts:1295](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1295)

Model identifier for multi-model support
