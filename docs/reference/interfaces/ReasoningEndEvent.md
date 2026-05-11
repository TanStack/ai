---
id: ReasoningEndEvent
title: ReasoningEndEvent
---

# Interface: ReasoningEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1114](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1114)

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

Defined in: [packages/typescript/ai/src/types.ts:1116](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1116)

Model identifier for multi-model support
