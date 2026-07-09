---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1230](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1230)

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

Defined in: [packages/ai/src/types.ts:1241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1241)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1239](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1239)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1232)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1243)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1237](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1237)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
