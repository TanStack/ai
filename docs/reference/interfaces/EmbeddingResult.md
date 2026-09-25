---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:2995](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2995)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3001)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2997](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2997)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2999](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2999)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3003](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3003)

Token usage information (if provided by the adapter)
