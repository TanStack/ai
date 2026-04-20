---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [packages/typescript/ai/src/types.ts:785](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L785)

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

Defined in: [packages/typescript/ai/src/types.ts:787](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L787)

Model identifier for multi-model support
