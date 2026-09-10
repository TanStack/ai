---
id: createSummarizeOptions
title: createSummarizeOptions
---

# Function: createSummarizeOptions()

```ts
function createSummarizeOptions<TAdapter, TStream>(options): SummarizeActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/ai/src/activities/summarize/index.ts:528](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/summarize/index.ts#L528)

Create typed options for the summarize() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`SummarizeAdapter`](../interfaces/SummarizeAdapter.md)\<`string`, `object`\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`SummarizeActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`SummarizeActivityOptions`\<`TAdapter`, `TStream`\>
