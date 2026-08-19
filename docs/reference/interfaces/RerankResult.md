---
id: RerankResult
title: RerankResult
---

# Interface: RerankResult\<TDocument\>

Defined in: [packages/ai/src/types.ts:2072](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2072)

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

Defined in: [packages/ai/src/types.ts:2073](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2073)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2074](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2074)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2076](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2076)

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

Defined in: [packages/ai/src/types.ts:2078](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2078)

The documents reordered by relevance — `ranking.map(r => r.document)`.

***

### usage

```ts
usage: TokenUsage;
```

Defined in: [packages/ai/src/types.ts:2085](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2085)

Usage for the request. Rerank typically bills in provider-defined "search
units" (`usage.billed = { quantity, unit: 'units' }`) rather than tokens. Some
providers (for example OpenRouter) may also report `totalTokens` and `cost`.
Cohere reports only search units and leaves the token counts at 0. The
deprecated `unitsBilled` field is still populated for compatibility.
