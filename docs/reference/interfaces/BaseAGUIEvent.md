---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

Defined in: [packages/ai/src/types.ts:1200](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1200)

Base structure for AG-UI events.
Extends @ag-ui/core BaseEvent. TanStack extras ride in `metadata`.

@ag-ui/core provides: `type`, `timestamp?`, `rawEvent?`

## Extends

- `BaseEvent`

## Indexable

```ts
[key: string]: unknown
```

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1201](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1201)

Extra information attached to this event.

#### Overrides

```ts
AGUIBaseEvent.metadata
```
