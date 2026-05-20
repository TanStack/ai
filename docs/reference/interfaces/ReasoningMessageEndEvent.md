---
id: ReasoningMessageEndEvent
title: ReasoningMessageEndEvent
---

# Interface: ReasoningMessageEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1301](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1301)

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

Defined in: [packages/typescript/ai/src/types.ts:1303](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1303)

Model identifier for multi-model support
