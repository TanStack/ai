---
id: ResolvedEmbeddingItem
title: ResolvedEmbeddingItem
---

# Interface: ResolvedEmbeddingItem

Defined in: [packages/ai/src/utilities/embedding-input.ts:8](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/embedding-input.ts#L8)

One embedding input item resolved into its text and image constituents.
Produced by [resolveEmbeddingInput](../functions/resolveEmbeddingInput.md); adapters map each entry onto
one provider-native input (one vector per entry).

## Properties

### images

```ts
images: ImagePart<unknown>[];
```

Defined in: [packages/ai/src/utilities/embedding-input.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/embedding-input.ts#L12)

Image parts of the item, in order (empty for text-only items)

***

### texts

```ts
texts: string[];
```

Defined in: [packages/ai/src/utilities/embedding-input.ts:10](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/embedding-input.ts#L10)

Text contents of the item, in order (empty for image-only items)
