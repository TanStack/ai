---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/ai/src/types.ts:1190](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1190)

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

Defined in: [packages/ai/src/types.ts:1192](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1192)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1197](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1197)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/ai/src/types.ts:1199](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1199)

Type of step (e.g., 'thinking', 'planning')
