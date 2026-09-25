---
id: uploadFile
title: uploadFile
---

```ts
function uploadFile<TName>(options): Promise<FileHandle<TName>>;
```

Defined in: [packages/ai/src/activities/files/index.ts:27](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/index.ts#L27)

Upload a file to a provider's Files API and return its handle. The handle
carries the provider name as a literal type, so passing it to another
provider's lifecycle call is a compile error.

## Type Parameters

### TName

`TName` *extends* `string`

## Parameters

### options

#### adapter

[`FilesAdapter`](../interfaces/FilesAdapter.md)\<`TName`\> & `object`

#### input

[`FileUploadInput`](../type-aliases/FileUploadInput.md)

## Returns

`Promise`\<[`FileHandle`](../interfaces/FileHandle.md)\<`TName`\>\>

## Example

```ts
const files = openaiFiles()
const handle = await uploadFile({ adapter: files, input: { data, mimeType: 'image/png' } })
```
