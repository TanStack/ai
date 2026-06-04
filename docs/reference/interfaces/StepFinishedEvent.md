---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1141](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1141)

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

Defined in: [packages/ai/src/types.ts:1152](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1152)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1150)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1143](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1143)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1154](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1154)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1148)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
