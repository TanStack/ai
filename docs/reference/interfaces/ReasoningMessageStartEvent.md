---
id: ReasoningMessageStartEvent
title: ReasoningMessageStartEvent
---

# Interface: ReasoningMessageStartEvent

Defined in: [packages/typescript/ai/src/types.ts:1181](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1181)

Emitted when a reasoning message starts.

@ag-ui/core provides: `messageId`, `role` ("reasoning")
TanStack AI adds: `model?`

## Extends

- `ReasoningMessageStartEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1183](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1183)

Model identifier for multi-model support
