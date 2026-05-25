---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [packages/typescript/ai/src/types.ts:1096](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1096)

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

Defined in: [packages/typescript/ai/src/types.ts:1107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1107)

Full accumulated thinking content (TanStack AI internal)

***

### delta?

```ts
optional delta: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1105)

Incremental thinking content (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1098](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1098)

Model identifier for multi-model support

***

### signature?

```ts
optional signature: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1109)

Provider signature for the thinking block

***

### ~~stepId?~~

```ts
optional stepId: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1103)

#### Deprecated

Use `stepName` instead (from @ag-ui/core spec).
Kept for backward compatibility.
