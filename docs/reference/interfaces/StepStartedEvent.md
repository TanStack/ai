---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/ai/src/types.ts:1328](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1328)

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

Defined in: [packages/ai/src/types.ts:1330](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1330)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId?: string;
```

Defined in: [packages/ai/src/types.ts:1335](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1335)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType?: string;
```

Defined in: [packages/ai/src/types.ts:1337](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1337)

Type of step (e.g., 'thinking', 'planning')
