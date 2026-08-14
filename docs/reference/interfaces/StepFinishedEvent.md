---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1331](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1331)

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
optional content?: string;
```

Defined in: [packages/ai/src/types.ts:1342](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1342)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta?: string;
```

Defined in: [packages/ai/src/types.ts:1340](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1340)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1333](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1333)

Model identifier for multi-model support

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:1344](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1344)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId?: string;
```

Defined in: [packages/ai/src/types.ts:1338](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1338)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
