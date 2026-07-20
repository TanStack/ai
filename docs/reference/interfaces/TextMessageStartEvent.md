---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/ai/src/types.ts:1113](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1113)

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

Defined in: [packages/ai/src/types.ts:1115](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1115)

Model identifier for multi-model support
