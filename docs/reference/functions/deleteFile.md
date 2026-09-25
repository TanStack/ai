---
id: deleteFile
title: deleteFile
---

```ts
function deleteFile<TName>(options): Promise<void>;
```

Defined in: [packages/ai/src/activities/files/index.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/index.ts#L72)

Delete a previously uploaded file. Accepts the handle itself (preferred —
the provider-literal type rejects a foreign provider's handle at compile
time) or its raw lifecycle id.

## Type Parameters

### TName

`TName` *extends* `string`

## Parameters

### options

#### adapter

[`FilesAdapter`](../interfaces/FilesAdapter.md)\<`TName`\> & `object`

#### id

  \| `string`
  \| [`FileHandle`](../interfaces/FileHandle.md)\<`NoInfer`\<`TName`\>\>

## Returns

`Promise`\<`void`\>

## Throws

if the provider's files adapter has no `delete` (e.g. fal storage).
