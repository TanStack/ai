---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/typescript/ai/src/types.ts:867](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L867)

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

Defined in: [packages/typescript/ai/src/types.ts:869](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L869)

Model identifier for multi-model support
