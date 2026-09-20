---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: [packages/ai/src/types.ts:2606](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2606)

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: [packages/ai/src/types.ts:2612](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2612)

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2608)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2610](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2610)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2614](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2614)

Token usage information (if provided by the adapter)
