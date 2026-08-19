---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [packages/ai/src/types.ts:1197](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1197)

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
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1199](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1199)

Model identifier for multi-model support
