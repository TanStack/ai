---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1338](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1338)

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

Defined in: [packages/ai/src/types.ts:1349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1349)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta?: string;
```

Defined in: [packages/ai/src/types.ts:1347](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1347)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1340](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1340)

Model identifier for multi-model support

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:1351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1351)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId?: string;
```

Defined in: [packages/ai/src/types.ts:1345](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1345)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
