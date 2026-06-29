---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/ai/src/types.ts:1062](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1062)

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

Defined in: [packages/ai/src/types.ts:1064](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1064)

Model identifier for multi-model support
