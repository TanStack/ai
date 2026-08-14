---
id: RerankResult
title: RerankResult
---

# Interface: RerankResult\<TDocument\>

Defined in: [packages/ai/src/types.ts:2064](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2064)

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

Defined in: [packages/ai/src/types.ts:2065](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2065)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2066](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2066)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2068](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2068)

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

Defined in: [packages/ai/src/types.ts:2070](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2070)

The documents reordered by relevance — `ranking.map(r => r.document)`.

***

### usage

```ts
usage: TokenUsage;
```

Defined in: [packages/ai/src/types.ts:2077](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2077)

Usage for the request. Rerank typically bills in provider-defined "search
units" (`usage.unitsBilled`) rather than tokens. Some providers (e.g.
OpenRouter) may also report `totalTokens` and `cost`; Cohere reports only
search units and leaves the token counts at 0.
