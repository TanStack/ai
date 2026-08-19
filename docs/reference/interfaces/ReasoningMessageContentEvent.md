---
id: ReasoningMessageContentEvent
title: ReasoningMessageContentEvent
---

# Interface: ReasoningMessageContentEvent

Defined in: [packages/ai/src/types.ts:1688](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1688)

Emitted when reasoning message content is generated.

@ag-ui/core provides: `messageId`, `delta`
TanStack AI adds: `model?`

## Extends

- `ReasoningMessageContentEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1690](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1690)

Model identifier for multi-model support
