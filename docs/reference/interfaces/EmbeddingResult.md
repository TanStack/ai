---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:2850](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2850)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2856](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2856)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2852](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2852)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2854](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2854)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2858](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2858)

Token usage information (if provided by the adapter)
