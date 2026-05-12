---
id: ReasoningMessageEndEvent
title: ReasoningMessageEndEvent
---

# Interface: ReasoningMessageEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1103)

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

Defined in: [packages/typescript/ai/src/types.ts:1105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1105)

Model identifier for multi-model support
