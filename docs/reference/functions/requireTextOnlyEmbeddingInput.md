---
id: requireTextOnlyEmbeddingInput
title: requireTextOnlyEmbeddingInput
---

# Function: requireTextOnlyEmbeddingInput()

```ts
function requireTextOnlyEmbeddingInput(
   input, 
   provider, 
   model): string[];
```

Defined in: [packages/ai/src/utilities/embedding-input.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/embedding-input.ts#L53)

Extract plain text inputs for a text-only embedding model, throwing a
uniform error if any item carries an image. The per-model modality typing
rejects these at compile time; this guard covers untyped/dynamic callers.

## Parameters

### input

[`EmbeddingInputItem`](../type-aliases/EmbeddingInputItem.md)[]

### provider

`string`

### model

`string`

## Returns

`string`[]
