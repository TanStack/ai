---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:3366](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3366)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3372](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3372)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3368](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3368)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3370](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3370)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3374)

Token usage information (if provided by the adapter)
