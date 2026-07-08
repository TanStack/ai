---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [packages/ai/src/types.ts:1128](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1128)

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

Defined in: [packages/ai/src/types.ts:1130](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1130)

Model identifier for multi-model support
