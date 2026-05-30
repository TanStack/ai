---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1125](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1125)

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

Defined in: [packages/ai/src/types.ts:1136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1136)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1134](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1134)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1127](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1127)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1138](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1138)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1132](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1132)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
