---
id: createImageOptions
title: createImageOptions
---

# Function: createImageOptions()

```ts
function createImageOptions<TAdapter, TStream>(options): ImageActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/ai/src/activities/generateImage/index.ts:384](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateImage/index.ts#L384)

Create typed options for the generateImage() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`ImageAdapter`](../interfaces/ImageAdapter.md)\<`string`, `any`, `any`, `any`, [`ModelInputModalitiesByName`](../type-aliases/ModelInputModalitiesByName.md)\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`ImageActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`ImageActivityOptions`\<`TAdapter`, `TStream`\>
