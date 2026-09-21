---
id: RerankResult
title: RerankResult
---

Defined in: [packages/ai/src/types.ts:1840](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1840)

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

Defined in: [packages/ai/src/types.ts:1841](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1841)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1842](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1842)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:1844](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1844)

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

Defined in: [packages/ai/src/types.ts:1846](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1846)

The documents reordered by relevance — `ranking.map(r => r.document)`.

***

### usage

```ts
usage: TokenUsage;
```

Defined in: [packages/ai/src/types.ts:1854](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1854)

Usage for the request. Rerank typically bills in provider-defined "search
units" (`usage.billed = { quantity, unit: 'units' }`) rather than tokens.
Some providers (e.g. OpenRouter) may also report `totalTokens` and `cost`.
Cohere reports only search units and leaves the token counts at 0.
The deprecated `unitsBilled` field is still populated for compatibility.
