---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:2932](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2932)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2938](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2938)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2934](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2934)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2936](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2936)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2940](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2940)

Token usage information (if provided by the adapter)
