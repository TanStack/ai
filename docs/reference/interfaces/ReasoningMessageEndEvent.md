---
id: ReasoningMessageEndEvent
title: ReasoningMessageEndEvent
---

# Interface: ReasoningMessageEndEvent

Defined in: [packages/ai/src/types.ts:1605](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1605)

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

Defined in: [packages/ai/src/types.ts:1607](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1607)

Model identifier for multi-model support
