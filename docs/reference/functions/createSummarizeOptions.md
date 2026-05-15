---
id: createSummarizeOptions
title: createSummarizeOptions
---

# Function: createSummarizeOptions()

```ts
function createSummarizeOptions<TAdapter, TStream>(options): SummarizeActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/typescript/ai/src/activities/summarize/index.ts:298](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/summarize/index.ts#L298)

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
