---
id: EmbeddingResult
title: EmbeddingResult
---

# Interface: EmbeddingResult

Defined in: [packages/ai/src/types.ts:2723](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2723)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2729](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2729)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2725)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2727](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2727)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2731](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2731)

Token usage information (if provided by the adapter)
