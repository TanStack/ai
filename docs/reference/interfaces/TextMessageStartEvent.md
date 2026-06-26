---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/ai/src/types.ts:1044](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1044)

Emitted when a text message starts.

@ag-ui/core provides: `messageId`, `role?`, `name?`
TanStack AI adds: `model?`

## Extends

- `TextMessageStartEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1046](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1046)

Model identifier for multi-model support
