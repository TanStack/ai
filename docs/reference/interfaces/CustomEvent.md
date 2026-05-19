---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [packages/typescript/ai/src/types.ts:1126](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1126)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`
TanStack AI adds: `model?`

## Extends

- `CustomEvent`

## Extended by

- [`StructuredOutputCompleteEvent`](StructuredOutputCompleteEvent.md)
- [`StructuredOutputStartEvent`](StructuredOutputStartEvent.md)
- [`ApprovalRequestedEvent`](ApprovalRequestedEvent.md)
- [`ToolInputAvailableEvent`](ToolInputAvailableEvent.md)

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1128](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1128)

Model identifier for multi-model support
