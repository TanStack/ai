---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:3397](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3397)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3403)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3399)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3401)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3405](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3405)

Token usage information (if provided by the adapter)
