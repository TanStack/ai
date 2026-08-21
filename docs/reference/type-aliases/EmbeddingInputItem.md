---
id: EmbeddingInputItem
title: EmbeddingInputItem
---

# Type Alias: EmbeddingInputItem

```ts
type EmbeddingInputItem = 
  | string
  | TextPart
  | ImagePart
  | EmbeddingContentParts;
```

Defined in: [packages/ai/src/types.ts:2682](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2682)

One embeddable item, producing exactly one vector. A bare string is
shorthand for a text part; a nested [EmbeddingContentParts](EmbeddingContentParts.md) array
fuses its parts into a single vector. Note that a bare array at the top
level of `input` is the *list of items* (one vector each) — fuse by
nesting, e.g. `input: [[textPart, imagePart]]`.
