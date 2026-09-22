---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:2872](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2872)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2878](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2878)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2874](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2874)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2876](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2876)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2880](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2880)

Token usage information (if provided by the adapter)
