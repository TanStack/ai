---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:989](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L989)

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

Defined in: [packages/typescript/ai/src/types.ts:1000](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1000)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/typescript/ai/src/types.ts:998](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L998)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:991](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L991)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1002](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1002)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:996](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L996)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
