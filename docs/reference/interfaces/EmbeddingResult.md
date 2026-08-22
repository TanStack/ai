---
id: EmbeddingResult
title: EmbeddingResult
---

# Interface: EmbeddingResult

Defined in: [packages/ai/src/types.ts:2460](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2460)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2466](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2466)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2462)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2464](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2464)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2468)

Token usage information (if provided by the adapter)
