---
id: resolveEmbeddingInput
title: resolveEmbeddingInput
---

# Function: resolveEmbeddingInput()

```ts
function resolveEmbeddingInput(input): ResolvedEmbeddingItem[];
```

Defined in: [packages/ai/src/utilities/embedding-input.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/embedding-input.ts#L42)

Resolve each embedding input item into its text and image constituents,
preserving input order (result[i] corresponds to input[i] and to the
vector at index i).

## Parameters

### input

[`EmbeddingInputItem`](../type-aliases/EmbeddingInputItem.md)[]

## Returns

[`ResolvedEmbeddingItem`](../interfaces/ResolvedEmbeddingItem.md)[]
