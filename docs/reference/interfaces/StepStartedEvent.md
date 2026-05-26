---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/typescript/ai/src/types.ts:1062](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1062)

Emitted when a thinking/reasoning step starts.

@ag-ui/core provides: `stepName`
TanStack AI adds: `model?`, `stepId?` (deprecated alias), `stepType?`

## Extends

- `StepStartedEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1064](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1064)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1069](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1069)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1071](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1071)

Type of step (e.g., 'thinking', 'planning')
