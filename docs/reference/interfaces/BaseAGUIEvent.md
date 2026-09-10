---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [packages/ai/src/types.ts:1154](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1154)

Base structure for AG-UI events.
Extends @ag-ui/core BaseEvent. TanStack extras ride in `metadata`.

@ag-ui/core provides: `type`, `timestamp?`, `rawEvent?`

## Extends

- `BaseEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1155](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1155)
