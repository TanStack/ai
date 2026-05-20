---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:1075](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1075)

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

Defined in: [packages/typescript/ai/src/types.ts:1086](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1086)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1084](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1084)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1077](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1077)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1088](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1088)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1082](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1082)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
