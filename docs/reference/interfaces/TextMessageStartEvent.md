---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/ai/src/types.ts:1082](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1082)

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

Defined in: [packages/ai/src/types.ts:1084](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1084)

Model identifier for multi-model support
