---
id: EmbeddingInputItemFor
title: EmbeddingInputItemFor
---

# Type Alias: EmbeddingInputItemFor\<TModalities\>

```ts
type EmbeddingInputItemFor<TModalities> = 
  | string
  | TextPart
  | EmbeddingItemByModality[TModalities];
```

Defined in: [packages/ai/src/types.ts:2418](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2418)

Embedding item type narrowed to the modalities a specific model supports.
`EmbeddingInputItemFor<'text'>` (a text-only model) is `string | TextPart`;
`'text' | 'image'` additionally admits image parts and fused
[EmbeddingContentParts](EmbeddingContentParts.md) arrays. Used by the activity option types
together with the adapter's per-model modality map so unsupported inputs
fail at compile time.

## Type Parameters

### TModalities

`TModalities` *extends* [`EmbeddingModality`](EmbeddingModality.md) = [`EmbeddingModality`](EmbeddingModality.md)
