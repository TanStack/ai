---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/ai/src/types.ts:1182](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1182)

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

Defined in: [packages/ai/src/types.ts:1193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1193)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/ai/src/types.ts:1191](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1191)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1184](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1184)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/ai/src/types.ts:1195](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1195)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/ai/src/types.ts:1189](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1189)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
