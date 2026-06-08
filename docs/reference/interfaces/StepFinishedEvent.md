---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1147](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1147)

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

Defined in: [packages/ai/src/types.ts:1158](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1158)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1156](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1156)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1149](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1149)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1160](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1160)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1154](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1154)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
