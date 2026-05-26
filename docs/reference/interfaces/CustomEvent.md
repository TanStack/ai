---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [packages/ai/src/types.ts:1162](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1162)

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

Defined in: [packages/ai/src/types.ts:1164](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1164)

Model identifier for multi-model support
