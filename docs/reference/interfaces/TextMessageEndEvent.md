---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [packages/ai/src/types.ts:1039](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1039)

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

Defined in: [packages/ai/src/types.ts:1041](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1041)

Model identifier for multi-model support
