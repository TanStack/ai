---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:981](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L981)

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

Defined in: [packages/typescript/ai/src/types.ts:992](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L992)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/typescript/ai/src/types.ts:990](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L990)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:983](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L983)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/typescript/ai/src/types.ts:994](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L994)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:988](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L988)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
