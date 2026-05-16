---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/typescript/ai/src/types.ts:1002](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1002)

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

Defined in: [packages/typescript/ai/src/types.ts:1004](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1004)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1009](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1009)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1011](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1011)

Type of step (e.g., 'thinking', 'planning')
