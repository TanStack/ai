---
id: EmbeddingResult
title: EmbeddingResult
---

# Interface: EmbeddingResult

Defined in: [packages/ai/src/types.ts:2478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2478)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2484](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2484)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2480)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2482)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2486)

Token usage information (if provided by the adapter)
