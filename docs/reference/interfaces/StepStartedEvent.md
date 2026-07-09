---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/ai/src/types.ts:1228](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1228)

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

Defined in: [packages/ai/src/types.ts:1230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1230)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1235](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1235)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/ai/src/types.ts:1237](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1237)

Type of step (e.g., 'thinking', 'planning')
