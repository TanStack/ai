---
id: createSummarizeOptions
title: createSummarizeOptions
---

```ts
function createSummarizeOptions<TAdapter, TStream>(options): SummarizeActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/ai/src/activities/summarize/index.ts:598](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/summarize/index.ts#L598)

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
