---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [packages/typescript/ai/src/types.ts:888](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L888)

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

Defined in: [packages/typescript/ai/src/types.ts:890](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L890)

Model identifier for multi-model support
