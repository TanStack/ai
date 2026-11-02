---
id: getFile
title: getFile
---

```ts
function getFile<TName>(options): Promise<FileHandle<TName>>;
```

Defined in: [packages/ai/src/activities/files/index.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/index.ts#L49)

Fetch metadata for a previously uploaded file. Accepts the handle itself
(preferred — the provider-literal type rejects a foreign provider's handle
at compile time) or its raw lifecycle id.

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

`Promise`\<[`FileHandle`](../interfaces/FileHandle.md)\<`TName`\>\>

## Throws

if the provider's files adapter has no `get` (e.g. fal storage).
