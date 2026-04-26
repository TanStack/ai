---
id: createVideoOptions
title: createVideoOptions
---

# Function: createVideoOptions()

```ts
function createVideoOptions<TAdapter, TStream>(options): VideoCreateOptions<TAdapter, TStream>;
```

Defined in: [packages/typescript/ai/src/activities/generateVideo/index.ts:547](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateVideo/index.ts#L547)

Create typed options for the generateVideo() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VideoAdapter`](../interfaces/VideoAdapter.md)\<`string`, `any`, `any`, `any`\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`VideoCreateOptions`\<`TAdapter`, `TStream`\>

## Returns

`VideoCreateOptions`\<`TAdapter`, `TStream`\>
