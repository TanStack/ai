---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1312](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1312)

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

Defined in: [packages/typescript/ai/src/types.ts:1314](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1314)

Model identifier for multi-model support
