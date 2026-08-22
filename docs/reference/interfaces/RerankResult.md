---
id: RerankResult
title: RerankResult
---

# Interface: RerankResult\<TDocument\>

Defined in: [packages/ai/src/types.ts:1800](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1800)

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

Defined in: [packages/ai/src/types.ts:1801](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1801)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1802](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1802)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:1804](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1804)

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

Defined in: [packages/ai/src/types.ts:1806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1806)

The documents reordered by relevance — `ranking.map(r => r.document)`.

***

### usage

```ts
usage: TokenUsage;
```

Defined in: [packages/ai/src/types.ts:1814](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1814)

Usage for the request. Rerank typically bills in provider-defined "search
units" (`usage.billed = { quantity, unit: 'units' }`) rather than tokens.
Some providers (e.g. OpenRouter) may also report `totalTokens` and `cost`.
Cohere reports only search units and leaves the token counts at 0.
The deprecated `unitsBilled` field is still populated for compatibility.
