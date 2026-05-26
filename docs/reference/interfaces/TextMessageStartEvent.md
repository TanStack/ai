---
id: TextMessageStartEvent
title: TextMessageStartEvent
---

# Interface: TextMessageStartEvent

Defined in: [packages/typescript/ai/src/types.ts:958](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L958)

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

Defined in: [packages/typescript/ai/src/types.ts:960](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L960)

Model identifier for multi-model support
