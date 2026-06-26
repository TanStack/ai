---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/ai/src/types.ts:1152](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1152)

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

Defined in: [packages/ai/src/types.ts:1154](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1154)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1159](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1159)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/ai/src/types.ts:1161](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1161)

Type of step (e.g., 'thinking', 'planning')
