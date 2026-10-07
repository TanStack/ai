---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:3129](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3129)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:3135](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3135)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3131)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3133](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3133)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3137](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3137)

Token usage information (if provided by the adapter)
