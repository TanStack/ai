---
id: TextMessageEndEvent
title: TextMessageEndEvent
---

# Interface: TextMessageEndEvent

Defined in: [packages/typescript/ai/src/types.ts:998](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L998)

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

Defined in: [packages/typescript/ai/src/types.ts:1000](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1000)

Model identifier for multi-model support
