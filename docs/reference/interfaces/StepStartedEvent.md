---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/typescript/ai/src/types.ts:951](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L951)

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

Defined in: [packages/typescript/ai/src/types.ts:953](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L953)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:958](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L958)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:960](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L960)

Type of step (e.g., 'thinking', 'planning')
