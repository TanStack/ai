---
id: ReasoningMessageContentEvent
title: ReasoningMessageContentEvent
---

# Interface: ReasoningMessageContentEvent

Defined in: [packages/ai/src/types.ts:1454](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1454)

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
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1456](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1456)

Model identifier for multi-model support
