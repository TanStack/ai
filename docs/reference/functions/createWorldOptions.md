---
id: createWorldOptions
title: createWorldOptions
---

```ts
function createWorldOptions<TAdapter, TStream>(options): WorldActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/ai/src/activities/generateWorld/index.ts:325](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/index.ts#L325)

Create typed options for the generateWorld() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`WorldAdapter`](../interfaces/WorldAdapter.md)\<`string`, `WorldProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`WorldActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`WorldActivityOptions`\<`TAdapter`, `TStream`\>
