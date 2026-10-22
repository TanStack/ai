---
id: RerankResult
title: RerankResult
---

Defined in: packages/ai/src/types.ts:2227

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

Defined in: packages/ai/src/types.ts:2228

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:2229

***

### ranking

```ts
ranking: object[];
```

Defined in: packages/ai/src/types.ts:2231

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

Defined in: packages/ai/src/types.ts:2233

The documents reordered by relevance — `ranking.map(r => r.document)`.

***

### usage

```ts
usage: TokenUsage;
```

Defined in: packages/ai/src/types.ts:2240

Usage for the request. Rerank typically bills in provider-defined "search
units" (`usage.billed = { quantity, unit: 'units' }`) rather than tokens.
Some providers (e.g. OpenRouter) may also report `totalTokens` and `cost`.
Cohere reports only search units and leaves the token counts at 0.
