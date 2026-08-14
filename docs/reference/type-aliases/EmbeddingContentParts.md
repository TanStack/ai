---
id: EmbeddingContentParts
title: EmbeddingContentParts
---

# Type Alias: EmbeddingContentParts

```ts
type EmbeddingContentParts = (
  | TextPart
  | ImagePart)[];
```

Defined in: [packages/ai/src/types.ts:2652](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2652)

A fused multi-part embedding item: all parts are embedded together into a
single vector (e.g. a product photo plus its caption). Written as a nested
array of content parts — the same `Array<ContentPart>` convention chat
messages use — so a fused item is visually distinct from the top-level
`input` list, where each element produces its own vector. Supported by
multimodal embedding models such as Cohere embed-v4 and Amazon Titan
Multimodal.
