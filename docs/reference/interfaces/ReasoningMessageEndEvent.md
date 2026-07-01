---
id: ReasoningMessageEndEvent
title: ReasoningMessageEndEvent
---

# Interface: ReasoningMessageEndEvent

Defined in: [packages/ai/src/types.ts:1443](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1443)

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

Defined in: [packages/ai/src/types.ts:1445](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1445)

Model identifier for multi-model support
