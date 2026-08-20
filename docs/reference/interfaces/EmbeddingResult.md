---
id: EmbeddingResult
title: EmbeddingResult
---

# Interface: EmbeddingResult

Defined in: [packages/ai/src/types.ts:2736](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2736)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2742](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2742)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2738](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2738)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2740](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2740)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2744](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2744)

Token usage information (if provided by the adapter)
