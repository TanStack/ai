---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [packages/ai/src/types.ts:1074](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1074)

Emitted when a text message completes.

@ag-ui/core provides: `messageId`
TanStack AI adds: `model?`

## Extends

- `TextMessageEndEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1076](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1076)

Model identifier for multi-model support
