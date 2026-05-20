---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [packages/typescript/ai/src/types.ts:977](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L977)

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

Defined in: [packages/typescript/ai/src/types.ts:979](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L979)

Model identifier for multi-model support
