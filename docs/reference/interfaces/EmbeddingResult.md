---
id: EmbeddingResult
title: EmbeddingResult
---

Defined in: packages/ai/src/types.ts:3325

Result of embedding generation.

## Properties

### embeddings

```ts
embeddings: Embedding[];
```

Defined in: packages/ai/src/types.ts:3331

One embedding per input item, in input order

***

### id

```ts
id: string;
```

Defined in: packages/ai/src/types.ts:3327

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:3329

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/types.ts:3333

Token usage information (if provided by the adapter)
