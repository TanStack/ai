---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1170](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1170)

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

Defined in: [packages/ai/src/types.ts:1181](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1181)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1179](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1179)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1172](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1172)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1183](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1183)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1177](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1177)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
