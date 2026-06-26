---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [packages/ai/src/types.ts:964](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L964)

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

Defined in: [packages/ai/src/types.ts:966](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L966)

Model identifier for multi-model support
