---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:1080](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1080)

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

Defined in: [packages/typescript/ai/src/types.ts:1091](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1091)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1089](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1089)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1082](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1082)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1093](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1093)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1087](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1087)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
