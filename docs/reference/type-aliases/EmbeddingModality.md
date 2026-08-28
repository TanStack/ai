---
id: EmbeddingModality
title: EmbeddingModality
---

# Type Alias: EmbeddingModality

```ts
type EmbeddingModality = "text" | "image";
```

Defined in: [packages/ai/src/types.ts:2386](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2386)

Input modalities an embedding model can accept. Unlike
[MediaPromptModality](MediaPromptModality.md), `'text'` is listed explicitly because
text-only embedding models are the common case and the modality list
drives compile-time narrowing of [EmbeddingInputItem](EmbeddingInputItem.md).
