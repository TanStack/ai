---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1346](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1346)

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
optional content?: string;
```

Defined in: [packages/ai/src/types.ts:1357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1357)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta?: string;
```

Defined in: [packages/ai/src/types.ts:1355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1355)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1348](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1348)

Model identifier for multi-model support

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:1359](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1359)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId?: string;
```

Defined in: [packages/ai/src/types.ts:1353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1353)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
