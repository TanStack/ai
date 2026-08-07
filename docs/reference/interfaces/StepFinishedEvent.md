---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1271)

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

Defined in: [packages/ai/src/types.ts:1282](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1282)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1280](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1280)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1273](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1273)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1284](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1284)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1278](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1278)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
