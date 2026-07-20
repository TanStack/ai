---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/ai/src/types.ts:1145](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1145)

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

Defined in: [packages/ai/src/types.ts:1147](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1147)

Model identifier for multi-model support
