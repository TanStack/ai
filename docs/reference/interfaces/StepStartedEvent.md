---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [packages/typescript/ai/src/types.ts:963](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L963)

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

Defined in: [packages/typescript/ai/src/types.ts:965](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L965)

Model identifier for multi-model support

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:970](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L970)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:972](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L972)

Type of step (e.g., 'thinking', 'planning')
