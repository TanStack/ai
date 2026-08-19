---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/ai/src/types.ts:1316](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1316)

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
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1318](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1318)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId?: string;
```

Defined in: [packages/ai/src/types.ts:1323](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1323)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType?: string;
```

Defined in: [packages/ai/src/types.ts:1325](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1325)

Type of step (e.g., 'thinking', 'planning')
