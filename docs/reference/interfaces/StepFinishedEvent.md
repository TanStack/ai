---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1188](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1188)

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

Defined in: [packages/ai/src/types.ts:1199](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1199)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1197](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1197)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1190](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1190)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1201](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1201)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1195](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1195)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
