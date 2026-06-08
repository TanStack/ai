---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [packages/ai/src/types.ts:941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L941)

Base structure for AG-UI events.
Extends @ag-ui/core BaseEvent with TanStack AI additions.

@ag-ui/core provides: `type`, `timestamp?`, `rawEvent?`
TanStack AI adds: `model?`

## Extends

- `BaseEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:943](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L943)

Model identifier for multi-model support
