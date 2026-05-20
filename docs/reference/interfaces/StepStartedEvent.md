---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/typescript/ai/src/types.ts:1061](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1061)

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

Defined in: [packages/typescript/ai/src/types.ts:1063](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1063)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1068](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1068)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1070](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1070)

Type of step (e.g., 'thinking', 'planning')
