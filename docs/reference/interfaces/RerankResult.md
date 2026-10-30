---
id: RerankResult
title: RerankResult
---

Defined in: [packages/ai/src/types.ts:2285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2285)

Public result of the `rerank()` activity, generic over the caller's document
element type so `document` / `rerankedDocuments` carry the original values
(strings or objects), not their serialized form.

## Type Parameters

### TDocument

`TDocument` = `string`

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2286](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2286)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2287)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2289)

Scored results, highest relevance first.

#### document

```ts
document: TDocument;
```

#### index

```ts
index: number;
```

#### score

```ts
score: number;
```

***

### rerankedDocuments

```ts
rerankedDocuments: TDocument[];
```

Defined in: [packages/ai/src/types.ts:2291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2291)

The documents reordered by relevance — `ranking.map(r => r.document)`.

***

### usage

```ts
usage: TokenUsage;
```

Defined in: [packages/ai/src/types.ts:2298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2298)

Usage for the request. Rerank typically bills in provider-defined "search
units" (`usage.billed = { quantity, unit: 'units' }`) rather than tokens.
Some providers (e.g. OpenRouter) may also report `totalTokens` and `cost`.
Cohere reports only search units and leaves the token counts at 0.
