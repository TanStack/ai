---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:3373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3373)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3379](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3379)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3375)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3377)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3381](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3381)

Token usage information (if provided by the adapter)
