---
id: ReasoningMessageEndEvent
title: ReasoningMessageEndEvent
---

# Interface: ReasoningMessageEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1095](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1095)

Emitted when a reasoning message ends.

@ag-ui/core provides: `messageId`
TanStack AI adds: `model?`

## Extends

- `ReasoningMessageEndEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1097](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1097)

Model identifier for multi-model support
