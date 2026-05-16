---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:1020](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1020)

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

Defined in: [packages/typescript/ai/src/types.ts:1031](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1031)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1029](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1029)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1022](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1022)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1033)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1027](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1027)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
