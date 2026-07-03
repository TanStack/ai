---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/ai/src/types.ts:1212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1212)

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

Defined in: [packages/ai/src/types.ts:1214](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1214)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1219](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1219)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/ai/src/types.ts:1221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1221)

Type of step (e.g., 'thinking', 'planning')
