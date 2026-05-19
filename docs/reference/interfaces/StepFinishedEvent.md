---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:1060](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1060)

Emitted when a thinking/reasoning step finishes.

@ag-ui/core provides: `stepName`
TanStack AI adds: `model?`, `stepId?` (deprecated alias), `delta?`, `content?`

## Extends

- `StepFinishedEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### content?

```ts
optional content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1071](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1071)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1069](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1069)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1062](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1062)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1073](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1073)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1067](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1067)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
