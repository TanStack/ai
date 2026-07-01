---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1208](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1208)

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

Defined in: [packages/ai/src/types.ts:1219](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1219)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1217)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1210](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1210)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1221)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1215](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1215)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
