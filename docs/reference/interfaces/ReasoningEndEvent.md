---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1106](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1106)

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

Defined in: [packages/typescript/ai/src/types.ts:1108](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1108)

Model identifier for multi-model support
