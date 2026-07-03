---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [packages/ai/src/types.ts:1024](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1024)

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

Defined in: [packages/ai/src/types.ts:1026](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1026)

Model identifier for multi-model support
