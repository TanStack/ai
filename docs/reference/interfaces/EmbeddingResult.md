---
id: EmbeddingResult
title: EmbeddingResult
---

# Interface: EmbeddingResult

Defined in: [packages/ai/src/types.ts:2744](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2744)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2750](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2750)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2746](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2746)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2748](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2748)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2752](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2752)

Token usage information (if provided by the adapter)
