---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:3150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3150)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3156](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3156)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3152](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3152)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3154](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3154)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3158](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3158)

Token usage information (if provided by the adapter)
