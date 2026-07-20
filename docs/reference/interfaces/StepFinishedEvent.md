---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1239](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1239)

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

Defined in: [packages/ai/src/types.ts:1250](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1250)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1248](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1248)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1241)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1252)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1246](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1246)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
