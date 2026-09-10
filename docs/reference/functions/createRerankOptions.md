---
id: createRerankOptions
title: createRerankOptions
---

# Function: createRerankOptions()

```ts
function createRerankOptions<TAdapter, TDocument>(options): RerankActivityOptions<TAdapter, TDocument>;
```

Defined in: [packages/ai/src/activities/rerank/index.ts:287](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/rerank/index.ts#L287)

Create typed options for the rerank() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`RerankAdapter`](../interfaces/RerankAdapter.md)\<`string`, `RerankProviderOptions`\<`TAdapter`\>\>

### TDocument

`TDocument` *extends* `string` \| `object` = `string`

## Parameters

### options

`RerankActivityOptions`\<`TAdapter`, `TDocument`\>

## Returns

`RerankActivityOptions`\<`TAdapter`, `TDocument`\>
