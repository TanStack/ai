---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/ai/src/types.ts:1185](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1185)

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
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1187)

Model identifier for multi-model support
