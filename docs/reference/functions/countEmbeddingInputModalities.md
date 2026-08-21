---
id: countEmbeddingInputModalities
title: countEmbeddingInputModalities
---

# Function: countEmbeddingInputModalities()

```ts
function countEmbeddingInputModalities(input): object;
```

Defined in: [packages/ai/src/utilities/embedding-input.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/embedding-input.ts#L73)

Count text-only and image-carrying items for observability events. Never
exposes input content.

## Parameters

### input

[`EmbeddingInputItem`](../type-aliases/EmbeddingInputItem.md)[]

## Returns

`object`

### imageInputCount

```ts
imageInputCount: number;
```

### textInputCount

```ts
textInputCount: number;
```
