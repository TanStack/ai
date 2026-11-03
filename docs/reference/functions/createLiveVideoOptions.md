---
id: createLiveVideoOptions
title: createLiveVideoOptions
---

```ts
function createLiveVideoOptions<TAdapter, TStream>(options): LiveVideoActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/ai/src/activities/generateLiveVideo/index.ts:324](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateLiveVideo/index.ts#L324)

Create typed options for the generateLiveVideo() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`LiveVideoAdapter`](../interfaces/LiveVideoAdapter.md)\<`string`, `LiveVideoProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`LiveVideoActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`LiveVideoActivityOptions`\<`TAdapter`, `TStream`\>
