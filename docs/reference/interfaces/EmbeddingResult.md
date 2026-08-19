---
id: EmbeddingResult
title: EmbeddingResult
---

# Interface: EmbeddingResult

Defined in: [packages/ai/src/types.ts:2731](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2731)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2737](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2737)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2733](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2733)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2735](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2735)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2739](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2739)

Token usage information (if provided by the adapter)
