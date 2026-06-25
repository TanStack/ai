---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1148)

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

Defined in: [packages/ai/src/types.ts:1159](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1159)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1157](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1157)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1150)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1161](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1161)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1155](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1155)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
