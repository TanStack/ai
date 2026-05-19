---
id: ReasoningStartEvent
title: ReasoningStartEvent
---

# Interface: ReasoningStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1249](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1249)

Emitted when reasoning starts for a message.

@ag-ui/core provides: `messageId`
TanStack AI adds: `model?`

## Extends

- `ReasoningStartEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1251](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1251)

Model identifier for multi-model support
