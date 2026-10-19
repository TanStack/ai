---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:3402](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3402)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3408)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3404](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3404)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3406](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3406)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3410)

Token usage information (if provided by the adapter)
