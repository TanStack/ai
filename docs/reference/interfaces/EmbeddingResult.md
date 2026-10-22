---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:3408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3408)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3414)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3410)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3412](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3412)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3416](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3416)

Token usage information (if provided by the adapter)
