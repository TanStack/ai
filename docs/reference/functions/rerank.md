---
id: rerank
title: rerank
---

# Function: rerank()

```ts
function rerank<TAdapter, TDocument>(options): Promise<RerankResult<TDocument>>;
```

Defined in: [packages/ai/src/activities/rerank/index.ts:152](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/index.ts#L152)

Rerank activity - reorders documents by relevance to a query.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`RerankAdapter`](../interfaces/RerankAdapter.md)\<`string`, `RerankProviderOptions`\<`TAdapter`\>\>

### TDocument

`TDocument` *extends* `string` \| `object` = `string`

## Parameters

### options

`RerankActivityOptions`\<`TAdapter`, `TDocument`\>

## Returns

`Promise`\<[`RerankResult`](../interfaces/RerankResult.md)\<`TDocument`\>\>

## Examples

**Basic reranking**

```ts
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { ranking, rerankedDocuments } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'talk about rain',
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  topN: 2,
})

console.log(rerankedDocuments[0]) // 'rainy afternoon in the city'
```

**Reranking object documents**

```ts
const { ranking } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'best laptop for travel',
  documents: [
    { id: 1, text: 'A heavy gaming desktop' },
    { id: 2, text: 'A lightweight ultrabook with all-day battery' },
  ],
})

// ranking[0].document is the original object, fully typed.
console.log(ranking[0].document.id)
```
